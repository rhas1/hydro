"""Admin helpers for the command line.

    python -m app.cli create-admin you@example.com "Your Name"
    python -m app.cli reset-password you@example.com
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from .db import SessionLocal
from .models import Role, User
from .security import MAX_PASSWORD_BYTES, set_password


def ask_password() -> str:
    while True:
        password = getpass.getpass("Password (8-72 chars): ")
        if len(password) < 8:
            print("Too short.")
        elif len(password.encode()) > MAX_PASSWORD_BYTES:
            print("Too long.")
        elif password != getpass.getpass("Repeat password: "):
            print("Passwords don't match.")
        else:
            return password


def find_user(db, email: str) -> User | None:
    return db.scalars(select(User).where(func.lower(User.email) == email.lower())).first()


def create_admin(email: str, name: str) -> None:
    with SessionLocal() as db:
        if find_user(db, email):
            sys.exit(f"{email} already exists; use reset-password instead.")
        user = User(email=email.lower(), full_name=name, role=Role.admin, is_active=True)
        set_password(user, ask_password())
        db.add(user)
        db.commit()
    print(f"Admin {email} created.")


def reset_password(email: str) -> None:
    with SessionLocal() as db:
        user = find_user(db, email)
        if user is None:
            sys.exit(f"No user with email {email}.")
        set_password(user, ask_password())
        user.is_active = True
        db.commit()
    print(f"Password for {email} updated.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("create-admin", help="Create an admin user")
    p.add_argument("email")
    p.add_argument("name", nargs="?", default="Administrator")
    p = sub.add_parser("reset-password", help="Set a new password for a user (and re-enable them)")
    p.add_argument("email")
    args = parser.parse_args()

    if args.command == "create-admin":
        create_admin(args.email, args.name)
    else:
        reset_password(args.email)


if __name__ == "__main__":
    main()
