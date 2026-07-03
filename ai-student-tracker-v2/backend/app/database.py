# database.py - PostgreSQL Database Connection using SQLAlchemy

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL connection URL from .env file
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres123@localhost:5432/ai_student_tracker"
)

# Create database engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,    # Check connection health
    pool_recycle=300,       # Recycle connections every 5 mins
    echo=False              # Set True to see SQL queries in terminal
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()

# Dependency — provides DB session to each API route
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
