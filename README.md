# Inagiffy Bot - Client-Focused Task & Review Management

Inagiffy Bot is a Slack bot designed to help teams manage tasks, content reviews, and client workflows. It provides channel-specific management, easy task assignment and tracking, structured review processes, and daily team reports.

## Features

- **Client-specific workflows**: Manage tasks and reviews per client channel
- **Task management**: Assign, track, and complete tasks with priorities and deadlines
- **Review system**: Request reviews from team members with approval workflows
- **Status tracking**: Check content status by client (draft, design, review, approved, published)
- **Reminders**: Automatic notifications for upcoming deadlines
- **Daily reports**: End-of-day summaries of team activities

## Command Reference

### Task Management

#### Assign Tasks
```
/assign @username [task description] [options]
```

**Options:**
- `-urgent` - Set as high priority with urgent deadline
- `-team=teamname` - Specify team (content, design, product, ops)
- `-priority=level` - Set priority (urgent, high, medium, low)
- `-deadline=YYYY-MM-DD` - Set custom due date
- `-client=clientname` - Associate with specific client

**Examples:**
- `/assign @sarah Write Q2 marketing report -team=content`
- `/assign @john Update homepage design -urgent`
- `/assign @alex Finalize budget -team=ops -deadline=2025-05-15`

#### View Tasks
```
/tasks [filters]
```

**Filter options:**
- `@username` - View a specific user's tasks
- `team=teamname` - Filter by team (content, design, product, ops)
- `priority=level` - Filter by priority (urgent, high, medium, low)
- `status=state` - Filter by status (pending, in_progress, completed)
- `client=clientname` - Filter by client

**Examples:**
- `/tasks @david` - View David's tasks
- `/tasks team=design priority=high` - View high priority design tasks
- `/tasks client=acme` - View all tasks for Acme client

#### Complete Tasks
```
/done [task description]
```

**Examples:**
- `/done Write Q2 marketing report` - Complete task by description
- `/done homepage design` - Complete task by partial description

### Content Review System

#### Request Reviews
```
/review [title] [options]
```

**Options:**
- `#channel` - Specify client channel
- `@reviewer1 @reviewer2` - Tag reviewers directly
- `-url=link` - Link to the content being reviewed
- `-deadline=YYYY-MM-DD` - Set review deadline
- `-status=stage` - Set initial status (draft, design, in_review, approved, published)

**Examples:**
- `/review April Newsletter #sunroof @sarah @john -url=https://docs.google.com/doc`
- `/review Homepage Redesign @alex -status=design -deadline=2025-05-10`

#### Check Content Status
```
/client-status [client]
```

**Examples:**
- `/client-status` - Check status for current channel
- `/client-status #sunroof` - Check status for Sunroof client channel
- `/client-status acme` - Check status for Acme client by name

#### Approve Content
```
/approve [review title or ID] [optional comment]
```

**Examples:**
- `/approve April Newsletter` - Approve by title
- `/approve #acme Homepage Redesign` - Approve with client prefix
- `/approve Q2 Report "Looks great, ready to publish"` - Include approval comment

### Help Command
```
/inagiffyhelp
```
Displays a comprehensive guide to all bot commands.

## Direct Message Usage

You can also interact with Inagiffy Bot in direct messages using these command formats (without the slash):

- `assign @username [task] [options]`
- `tasks [filters]`
- `done [task description]`
- `review [title] [options]`
- `status [client]`
- `help` - Show command guide

## Automatic Features

- **Task Reminders**: Notifies assignees 1 hour before task deadlines
- **Daily Team Reports**: Sends end-of-day (5 PM) summaries to team channels
- **Review Notifications**: Alerts reviewers when they're requested to review content

## Setup

1. Install required dependencies:
   ```
   npm install
   ```

2. Set up the PostgreSQL database and run migrations:
   ```
   npx prisma migrate dev
   ```

3. Configure environment variables:
   ```
   SLACK_BOT_TOKEN=your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=your-app-token
   DATABASE_URL=your-database-url
   ```

4. Start the bot:
   ```
   npm start
   ```

## Project Structure

- `app.js` - Main bot application
- `schema.prisma` - Database schema
- `commands/` - Command handlers
- `services/` - Business logic
- `utils/` - Helper functions