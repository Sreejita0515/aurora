"""
Aurora ML Pipeline — Data Extraction & Preprocessing Module
Extracts historical transactions, products, and categories directly from SQLite (aurora.db).
Prepares a balanced daily panel time series for demand forecasting.
"""

import sqlite3
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'aurora.db')

def get_db_connection(db_path=DEFAULT_DB_PATH):
    """Establishes connection to the SQLite database."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found at: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def load_products_and_categories(conn):
    """Loads all active products and their category metadata."""
    query = """
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.price,
        p.original_price,
        p.stock,
        p.rating,
        p.reviews_count,
        p.category_id,
        c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name ASC
    """
    return pd.read_sql_query(query, conn)

def load_order_items(conn):
    """Loads date-stamped non-cancelled order line items."""
    query = """
    SELECT 
        oi.id AS item_id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.price AS unit_price,
        o.created_at AS order_date,
        o.status AS order_status
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'cancelled'
    ORDER BY o.created_at ASC
    """
    df = pd.read_sql_query(query, conn)
    df['order_date'] = pd.to_datetime(df['order_date'])
    df['date'] = df['order_date'].dt.floor('D')
    return df

def build_daily_product_panel(conn):
    """
    Builds a complete, dense daily time series panel for every product.
    If a product had 0 sales on a given day, it is recorded as quantity=0.
    """
    products_df = load_products_and_categories(conn)
    orders_df = load_order_items(conn)

    if orders_df.empty:
        raise ValueError("No valid orders found in database to build panel.")

    min_date = orders_df['date'].min()
    max_date = orders_df['date'].max()

    # Create full date range
    date_range = pd.date_range(start=min_date, end=max_date, freq='D')
    product_ids = products_df['product_id'].unique()

    # Cartesian product of all dates and all products
    panel_index = pd.MultiIndex.from_product(
        [date_range, product_ids],
        names=['date', 'product_id']
    ).to_frame().reset_index(drop=True)

    # Aggregate daily sales per product
    daily_sales = orders_df.groupby(['date', 'product_id'])['quantity'].sum().reset_index()
    daily_sales.rename(columns={'quantity': 'units_sold'}, inplace=True)

    # Merge to fill missing days with 0 sales
    panel = pd.merge(panel_index, daily_sales, on=['date', 'product_id'], how='left')
    panel['units_sold'] = panel['units_sold'].fillna(0).astype(int)

    # Merge static product attributes
    panel = pd.merge(panel, products_df, on='product_id', how='left')

    # Sort chronologically per product
    panel = panel.sort_values(by=['product_id', 'date']).reset_index(drop=True)

    return panel, products_df
