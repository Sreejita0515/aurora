"""
Aurora ML Pipeline — Demand Forecasting & Predictive Inventory Engine
Trains chronological Random Forest models for 7-day and 30-day forward demand,
compares against recent-average baselines with held-out MAE & RMSE,
and deterministically computes safety stocks and reorder quantities.
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

MODEL_VERSION = "rf_demand_v1.0.0"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
PREDICTIONS_DIR = os.path.join(os.path.dirname(__file__), "predictions")

# Lead time & safety stock reference by category
CATEGORY_OPERATIONS = {
    'cat-ethnic': {'lead_time_days': 16, 'safety_stock_days': 14, 'craft_origin': 'Varanasi / Kashmir Weaves'},
    'cat-handicrafts': {'lead_time_days': 12, 'safety_stock_days': 10, 'craft_origin': 'Jaipur / Dhokra Artisans'},
    'cat-ayurveda': {'lead_time_days': 8, 'safety_stock_days': 12, 'craft_origin': 'Kerala Ayurvedic Labs'},
    'cat-gourmet': {'lead_time_days': 7, 'safety_stock_days': 10, 'craft_origin': 'Malabar / Darjeeling Estates'},
    'cat-jewelry': {'lead_time_days': 14, 'safety_stock_days': 14, 'craft_origin': 'Jaipur / Cuttack Silversmiths'},
    'cat-gadgets': {'lead_time_days': 10, 'safety_stock_days': 12, 'craft_origin': 'OEM Electronics Assembly'},
}

def create_demand_features(panel_df):
    """
    Constructs time-series features and forward-looking targets without data leakage.
    Features are strictly computed on historical data (lagged / rolling).
    """
    df = panel_df.copy()
    df = df.sort_values(by=['product_id', 'date']).reset_index(drop=True)

    # Calendar features
    df['day_of_week'] = df['date'].dt.dayofweek
    df['day_of_month'] = df['date'].dt.day
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)

    # Grouped lagged features per product
    grouped = df.groupby('product_id')['units_sold']

    df['lag_1d'] = grouped.shift(1).fillna(0)
    df['lag_7d'] = grouped.shift(7).fillna(0)
    df['lag_14d'] = grouped.shift(14).fillna(0)

    # Rolling historical statistics (shift(1) ensures current day is excluded from feature)
    shifted = grouped.shift(1)
    df['rolling_7d_mean'] = shifted.rolling(window=7, min_periods=1).mean().fillna(0)
    df['rolling_14d_mean'] = shifted.rolling(window=14, min_periods=1).mean().fillna(0)
    df['rolling_28d_mean'] = shifted.rolling(window=28, min_periods=1).mean().fillna(0)
    df['rolling_7d_std'] = shifted.rolling(window=7, min_periods=1).std().fillna(0)

    # Category one-hot encoding
    category_dummies = pd.get_dummies(df['category_id'], prefix='cat', drop_first=False)
    for col in category_dummies.columns:
        df[col] = category_dummies[col].astype(int)

    # Forward-looking targets (next 7 days and next 30 days)
    # Target at day t = sum of sales from t+1 to t+horizon
    # Reversing series allows rolling sum forward
    def calc_forward_target(series, horizon):
        rev = series.iloc[::-1]
        target_rev = rev.rolling(window=horizon, min_periods=horizon).sum().shift(1)
        return target_rev.iloc[::-1]

    df['target_7d'] = df.groupby('product_id')['units_sold'].transform(lambda s: calc_forward_target(s, 7))
    df['target_30d'] = df.groupby('product_id')['units_sold'].transform(lambda s: calc_forward_target(s, 30))

    # Baseline predictions (recent average projected over horizon)
    df['baseline_7d'] = df['rolling_7d_mean'] * 7.0
    df['baseline_30d'] = df['rolling_14d_mean'] * 30.0

    return df

class DemandForecastingEngine:
    def __init__(self, model_version=MODEL_VERSION):
        self.version = model_version
        self.model_7d = None
        self.model_30d = None
        self.feature_cols = None
        self.evaluation_results = {}
        self.training_metadata = {}

    def get_feature_columns(self, df):
        """Identifies feature columns for regression."""
        cat_cols = [c for c in df.columns if c.startswith('cat_')]
        features = [
            'price', 'rating', 'reviews_count',
            'day_of_week', 'day_of_month', 'is_weekend',
            'lag_1d', 'lag_7d', 'lag_14d',
            'rolling_7d_mean', 'rolling_14d_mean', 'rolling_28d_mean', 'rolling_7d_std'
        ] + cat_cols
        return [f for f in features if f in df.columns]

    def train_and_evaluate(self, panel_df):
        """
        Executes chronological split, trains 7d and 30d Random Forest models,
        and computes held-out test evaluation against recent-average baselines.
        """
        df = create_demand_features(panel_df)
        self.feature_cols = self.get_feature_columns(df)

        # Split dates where targets are valid (avoid future truncation at dataset end)
        dates_7d = sorted(df[df['target_7d'].notna()]['date'].unique())
        dates_30d = sorted(df[df['target_30d'].notna()]['date'].unique())

        # 7-Day Horizon Split (Train: first 75%, Held-Out Test: last 25%)
        split_idx_7d = int(len(dates_7d) * 0.75)
        train_dates_7d = dates_7d[:split_idx_7d]
        test_dates_7d = dates_7d[split_idx_7d:]

        train_mask_7d = df['date'].isin(train_dates_7d) & df['target_7d'].notna()
        test_mask_7d = df['date'].isin(test_dates_7d) & df['target_7d'].notna()

        # Train 7-Day Model
        X_train_7d = df.loc[train_mask_7d, self.feature_cols]
        y_train_7d = df.loc[train_mask_7d, 'target_7d']
        X_test_7d = df.loc[test_mask_7d, self.feature_cols]
        y_test_7d = df.loc[test_mask_7d, 'target_7d']
        baseline_test_7d = df.loc[test_mask_7d, 'baseline_7d']

        self.model_7d = RandomForestRegressor(
            n_estimators=100, max_depth=5, min_samples_split=4, random_state=42
        )
        self.model_7d.fit(X_train_7d, y_train_7d)
        preds_7d = np.maximum(0, self.model_7d.predict(X_test_7d))

        eval_7d = {
            'baseline_mae': round(float(mean_absolute_error(y_test_7d, baseline_test_7d)), 3),
            'baseline_rmse': round(float(root_mean_squared_error(y_test_7d, baseline_test_7d)), 3),
            'model_mae': round(float(mean_absolute_error(y_test_7d, preds_7d)), 3),
            'model_rmse': round(float(root_mean_squared_error(y_test_7d, preds_7d)), 3),
            'test_samples': int(len(y_test_7d)),
            'train_samples': int(len(y_train_7d)),
            'train_period': f"{train_dates_7d[0].strftime('%Y-%m-%d')} to {train_dates_7d[-1].strftime('%Y-%m-%d')}",
            'test_period': f"{test_dates_7d[0].strftime('%Y-%m-%d')} to {test_dates_7d[-1].strftime('%Y-%m-%d')}"
        }

        # 30-Day Horizon Split (Train: first 70%, Held-Out Test: last 30%)
        split_idx_30d = int(len(dates_30d) * 0.70)
        train_dates_30d = dates_30d[:split_idx_30d]
        test_dates_30d = dates_30d[split_idx_30d:]

        train_mask_30d = df['date'].isin(train_dates_30d) & df['target_30d'].notna()
        test_mask_30d = df['date'].isin(test_dates_30d) & df['target_30d'].notna()

        # Train 30-Day Model
        X_train_30d = df.loc[train_mask_30d, self.feature_cols]
        y_train_30d = df.loc[train_mask_30d, 'target_30d']
        X_test_30d = df.loc[test_mask_30d, self.feature_cols]
        y_test_30d = df.loc[test_mask_30d, 'target_30d']
        baseline_test_30d = df.loc[test_mask_30d, 'baseline_30d']

        self.model_30d = RandomForestRegressor(
            n_estimators=100, max_depth=5, min_samples_split=4, random_state=42
        )
        self.model_30d.fit(X_train_30d, y_train_30d)
        preds_30d = np.maximum(0, self.model_30d.predict(X_test_30d))

        eval_30d = {
            'baseline_mae': round(float(mean_absolute_error(y_test_30d, baseline_test_30d)), 3),
            'baseline_rmse': round(float(root_mean_squared_error(y_test_30d, baseline_test_30d)), 3),
            'model_mae': round(float(mean_absolute_error(y_test_30d, preds_30d)), 3),
            'model_rmse': round(float(root_mean_squared_error(y_test_30d, preds_30d)), 3),
            'test_samples': int(len(y_test_30d)),
            'train_samples': int(len(y_train_30d)),
            'train_period': f"{train_dates_30d[0].strftime('%Y-%m-%d')} to {train_dates_30d[-1].strftime('%Y-%m-%d')}",
            'test_period': f"{test_dates_30d[0].strftime('%Y-%m-%d')} to {test_dates_30d[-1].strftime('%Y-%m-%d')}"
        }

        # Feature Importances (Top 6 from 30d model)
        importances = self.model_30d.feature_importances_
        feature_importance_list = sorted(
            [{'feature': f, 'importance': round(float(imp), 4)} for f, imp in zip(self.feature_cols, importances)],
            key=lambda x: x['importance'],
            reverse=True
        )[:6]

        self.evaluation_results = {
            'horizon_7d': eval_7d,
            'horizon_30d': eval_30d,
            'top_features': feature_importance_list,
            'split': {
                'train_period_7d': eval_7d['train_period'],
                'test_period_7d': eval_7d['test_period'],
                'train_period_30d': eval_30d['train_period'],
                'test_period_30d': eval_30d['test_period'],
                'total_days': len(df['date'].unique())
            }
        }

        self.training_metadata = {
            'version': self.version,
            'trained_at': datetime.now(timezone.utc).isoformat(),
            'feature_count': len(self.feature_cols),
            'algorithm': 'RandomForestRegressor (scikit-learn)',
            'evaluation': self.evaluation_results
        }

        return self.evaluation_results

    def generate_current_predictions(self, panel_df, products_df):
        """
        Uses the latest chronological observation for each product to predict
        forward 7-day and 30-day demand and compute inventory replenishment thresholds.
        """
        df = create_demand_features(panel_df)
        latest_date = df['date'].max()

        # Isolate the most recent day features for inference
        latest_rows = df[df['date'] == latest_date].copy()

        # Count total sales events in history to identify sparse products
        sales_counts = panel_df[panel_df['units_sold'] > 0].groupby('product_id')['units_sold'].count().to_dict()

        predictions = {}

        for _, row in latest_rows.iterrows():
            pid = row['product_id']
            p_name = row['product_name']
            stock = int(row['stock'])
            price = float(row['price'])
            cat_id = row['category_id']
            cat_name = row['category_name']

            ops = CATEGORY_OPERATIONS.get(cat_id, {
                'lead_time_days': 10,
                'safety_stock_days': 10,
                'craft_origin': 'Artisan Workshop'
            })
            lead_time = ops['lead_time_days']
            safety_days = ops['safety_stock_days']
            craft = ops['craft_origin']

            total_sales_events = sales_counts.get(pid, 0)
            is_fallback = total_sales_events < 4

            X_curr = pd.DataFrame([row[self.feature_cols]])

            if is_fallback:
                # Cold-start / sparse history fallback
                baseline_daily = max(row['rolling_14d_mean'], 0.05)
                pred_7d = round(baseline_daily * 7.0, 1)
                pred_30d = round(baseline_daily * 30.0, 1)
                fallback_reason = f"Sparse transaction history ({total_sales_events} sales events < 4 required). Fallback to empirical recent average."
                model_used = "EMPIRICAL_AVERAGE_FALLBACK"
            else:
                pred_7d = round(float(np.maximum(0, self.model_7d.predict(X_curr)[0])), 1)
                pred_30d = round(float(np.maximum(0, self.model_30d.predict(X_curr)[0])), 1)
                fallback_reason = None
                model_used = self.version

            daily_velocity = round(pred_30d / 30.0, 2)
            if daily_velocity <= 0:
                daily_velocity = 0.05

            days_to_stockout = int(round(stock / daily_velocity))

            # Deterministic Reorder Calculation
            # Lead Time Demand = LeadTimeDays * DailyVelocity
            # Safety Stock Units = SafetyStockDays * DailyVelocity
            # ROP = Lead Time Demand + Safety Stock Units
            lead_time_demand = int(np.ceil(lead_time * daily_velocity))
            safety_stock_units = int(np.ceil(safety_days * daily_velocity))
            reorder_point = lead_time_demand + safety_stock_units

            # 45-day target buffer
            target_45d_buffer = int(np.ceil(daily_velocity * 45))
            recommended_reorder_qty = max(0, target_45d_buffer - stock)

            estimated_cost_price = int(round(price * 0.58))
            reorder_cost = recommended_reorder_qty * estimated_cost_price

            # Stock status determination
            if stock <= 5 or days_to_stockout <= 7:
                status = 'CRITICAL_STOCKOUT'
                status_color = 'red'
                urgency = 95
            elif stock < reorder_point or days_to_stockout <= 21:
                status = 'REORDER_NOW'
                status_color = 'yellow'
                urgency = 75
            elif days_to_stockout > 80:
                status = 'OVERSTOCK_TRAP'
                status_color = 'blue'
                urgency = 30
            else:
                status = 'OPTIMAL'
                status_color = 'green'
                urgency = 10

            predictions[pid] = {
                'product_id': pid,
                'product_name': p_name,
                'category_id': cat_id,
                'category_name': cat_name,
                'craft_origin': craft,
                'stock': stock,
                'price': price,
                'estimated_cost_price': estimated_cost_price,
                'forecast_7d_units': pred_7d,
                'forecast_30d_units': pred_30d,
                'daily_velocity': daily_velocity,
                'days_until_stockout': days_to_stockout,
                'lead_time_days': lead_time,
                'safety_stock_days': safety_days,
                'safety_stock_units': safety_stock_units,
                'reorder_point': reorder_point,
                'recommended_reorder_qty': recommended_reorder_qty,
                'reorder_cost': reorder_cost,
                'status': status,
                'status_color': status_color,
                'urgency_score': urgency,
                'is_fallback': is_fallback,
                'fallback_reason': fallback_reason,
                'model_version': model_used,
                'prediction_date': latest_date.strftime('%Y-%m-%d'),
                'horizons': {'7d': pred_7d, '30d': pred_30d}
            }

        return predictions

    def save_artifacts(self, predictions):
        """Serializes models and writes predictions artifact to disk."""
        os.makedirs(MODELS_DIR, exist_ok=True)
        os.makedirs(PREDICTIONS_DIR, exist_ok=True)

        # Save model binaries
        joblib.dump(self.model_7d, os.path.join(MODELS_DIR, 'rf_demand_7d.joblib'))
        joblib.dump(self.model_30d, os.path.join(MODELS_DIR, 'rf_demand_30d.joblib'))
        joblib.dump(self.feature_cols, os.path.join(MODELS_DIR, 'demand_features.joblib'))

        # Save metadata and predictions JSON
        payload = {
            'metadata': self.training_metadata,
            'evaluation': self.evaluation_results,
            'predictions': predictions
        }

        artifact_path = os.path.join(PREDICTIONS_DIR, 'demand_predictions.json')
        with open(artifact_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2)

        return artifact_path
