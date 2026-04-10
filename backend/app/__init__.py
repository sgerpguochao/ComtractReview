import os
from app.config import settings

os.makedirs(settings.storage_path, exist_ok=True)
