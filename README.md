# Inventory Pro

A production-ready Real-Time Inventory Management System similar to Vyapar.

## Features
- **Stock Tracking**: Real-time dynamic stock calculation from transaction history.
- **Product Management**: Manual CRUD with low-stock alerts.
- **Auth**: Multi-role (Admin, Manager, Staff) JWT authentication.
- **Transactions**: Supports Purchase, Sale, Returns, and Manual Adjustments.
- **Dashboard**: Professional business analytics with inventory value tracking.
- **Excel Tools**: Bulk import products/stock and export inventory reports.

## Architecture
- **Backend**: FastAPI (Python)
- **Frontend**: Vanilla JS + Bootstrap 5
- **Database**: Oracle Autonomous Database
- **Auth**: JWT + Bcrypt

## Quick Start
1. Configure `.env` in `backend/` with your Oracle DB credentials.
2. Install dependencies: `pip install -r backend/requirements.txt`
3. Initialize Database: `python backend/init_db.py`
4. Run Backend: `uvicorn app.main:app --reload`
5. Open `frontend/login.html` (Default creds: admin / admin123)

## File Structure
- `backend/`: API logic, models, schemas.
- `frontend/`: Single Page Application files.
- `docs/`: Deployment guides and database setup.
- `scripts/`: Utility scripts.
