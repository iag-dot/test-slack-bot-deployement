# 🚀 Inagiffy Bot 

A Slack bot that helps manage newsletters and more through different workflow stages with a casual, GenZ-friendly vibe.

![Inagiffy Bot Banner](https://via.placeholder.com/800x200/0d1117/ffffff?text=Inagiffy+Bot)

## ✨ Features

- Assign tasks to team members with priority levels
- See existing workload before assigning new tasks
- Support for urgent tasks with the `-urgent` flag
- Automatic deadline calculation (or set custom deadlines)
- Task reminders before deadlines
- List tasks with optional filters
- Mark tasks as completed by ID or name
- Notifications with a fun, casual tone
- Support for different teams: content, product, design, ops

## 📋 Commands

### `/assign @username task description [options]`

Drop a task on someone's plate

**Options:**
- `-urgent` - For the ASAP stuff (1 day deadline)
- `-team=teamname` - Pick a squad (content, product, design, ops)
- `-deadline=YYYY-MM-DD` - Custom due date

**Examples:**
```
/assign @designer create new logo for homepage
/assign @writer draft blog post about new features -team=content
/assign @developer fix login bug -urgent
/assign @marketer create Q2 campaign -deadline=2025-06-30
```

### `/tasks [filters]`

Check what's on deck

**Examples:**
```
/tasks                       // See all tasks
/tasks @username             // Check someone's workload
/tasks stage=design          // Filter by team
/tasks priority=high         // Filter by priority
/tasks status=pending        // Filter by status
```

### `/markdone [taskId or task name]`

Claim your W when you finish a task

**Examples:**
```
/markdone 1682514937123      // Complete by ID
/markdone newsletter draft   // Complete by task name (partial matches work)
```

### `/taskhelp`

Get a refresher on all the commands

## 🔧 Setup

### Prerequisites
- Node.js (LTS version recommended)
- PostgreSQL database
- Slack workspace with permission to add apps

### Installation

1. Clone this repository
```bash
git clone https://github.com/your-username/inagiffy-bot.git
cd inagiffy-bot
```

2. Install dependencies
```bash
npm install
```

3. Create `.env` file with your credentials
```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
DATABASE_URL=postgresql://username:password@localhost:5432/inagiffy
PORT=3000
```

4. Set up the database
```bash
npx prisma migrate dev --name init
```

5. Start the bot
```bash
npm start
```

For development:
```bash
npm run dev
```


## 🔄 Smart Team Detection

Even without specifying a team, the bot automatically detects the team based on keywords in the task:

- **Content team**: writing, blog, article, post
- **Product team**: feature, roadmap, spec, dev
- **Design team**: ui, ux, mockup, wireframe
- **Ops team**: operation, logistics, process

## 📦 Project Structure

```
inagiffy-bot/
├── .env                   # Environment variables
├── app.js                 # Main application code
├── message-formatters.js  # Message formatting functions
├── package.json           # NPM package configuration
└── prisma/
    └── schema.prisma      # Database schema
```



## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[MIT](LICENSE)

---

Made with ✨ for your newsletter workflow