from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models.base import User, UserRole
from app.core import security
from app.db.base import Base

def init_db():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            print("Creating superuser 'admin'...")
            new_admin = User(
                username="admin",
                email="admin@inventorypro.com",
                hashed_password=security.get_password_hash("admin123"),
                role=UserRole.ADMIN
            )
            db.add(new_admin)
            db.commit()
            print("Superuser created successfully!")
        else:
            print("Superuser already exists.")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
