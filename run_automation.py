import subprocess
import sys
import argparse
import os
from pathlib import Path

def check_env():
    if not Path(".env").exists():
        print("Warning: .env file not found. Copying .env.example to .env...")
        if Path(".env.example").exists():
            with open(".env.example", "r") as f_in, open(".env", "w") as f_out:
                f_out.write(f_in.read())
        else:
            print("Error: .env.example not found. Please create a .env file.")
            sys.exit(1)

def run_command(cmd, env=None):
    print(f"Executing: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, check=True, env=env or os.environ.copy())
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Job Automation CLI Wrapper")
    parser.add_argument("command", choices=["live", "demo", "login", "dashboard", "scheduler"], help="Command to run")
    parser.add_argument("--limit", type=int, default=25, help="Limit for live command")
    parser.add_argument("--platform", help="Platform for login command")
    parser.add_argument("--auto-submit", action="store_true", help="Enable auto-submit for live command")
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode")
    
    args = parser.parse_args()

    check_env()

    if args.command == "live":
        cmd = ["node", "index.js", "live", f"--limit={args.limit}", "--prepare-apply"]
        env = os.environ.copy()
        if args.auto_submit:
            env["AUTO_SUBMIT"] = "true"
            env["LIVE_APPLY"] = "true"
        if args.headless:
            env["HEADLESS"] = "true"
        run_command(cmd, env=env)
    elif args.command == "demo":
        run_command(["node", "src/demo.js"])
    elif args.command == "login":
        if not args.platform:
            print("Error: --platform is required for login command")
            sys.exit(1)
        run_command(["node", "index.js", "login", args.platform])
    elif args.command == "dashboard":
        run_command(["npm", "run", "dashboard"])
    elif args.command == "scheduler":
        run_command(["node", "index.js", "scheduler"])

if __name__ == "__main__":
    main()
