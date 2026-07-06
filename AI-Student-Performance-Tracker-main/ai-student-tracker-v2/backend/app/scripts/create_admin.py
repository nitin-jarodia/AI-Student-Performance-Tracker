"""CLI entry: python -m app.scripts.create_admin"""

from app.scripts.bootstrap_users import main

if __name__ == "__main__":
    raise SystemExit(main())
