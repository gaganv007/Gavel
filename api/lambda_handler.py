"""AWS Lambda entry point for Gavel.

Wraps the FastAPI app with Mangum so it can run behind API Gateway.
"""
from mangum import Mangum
from main import app

handler = Mangum(app, lifespan="off")
