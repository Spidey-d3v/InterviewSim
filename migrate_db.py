import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from convFlow.database import engine
from convFlow.models import Base

print("Creating all tables in database...")
Base.metadata.create_all(bind=engine)
print("Done!")
