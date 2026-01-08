# WhatsApp Community Bot

CLI tool to manage WhatsApp communities - find inactive users and clean up membership.

## Setup

```bash
yarn install
yarn start
```

On first run, scan the QR code to authenticate with WhatsApp Web.

## Features

- **Inactive Users Report** - Find users who haven't sent messages in the last 90 days
- **Group Intersections** - See overlap between groups as a CSV matrix
- **Users in One Group** - Find users only in a single group
- **Remove Users** - Remove inactive users from the community

## Output Files

Reports are saved as dated CSV files:
- `YYYY-MM-DD-inactive-users-unread.csv`
- `YYYY-MM-DD-inactive-users-undelivered.csv`
- `YYYY-MM-DD-group-intersections.csv`
- `YYYY-MM-DD-users-only-in-one-group.csv`

