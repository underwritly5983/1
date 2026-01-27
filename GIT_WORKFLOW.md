# Git Workflow Guide

## Quick Commands

### Save Your Progress (Create a Savepoint)

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "Description of what you changed"
```

### View Your Savepoints

```bash
# See commit history
git log --oneline

# See what files changed
git status

# See detailed changes
git diff
```

### Go Back to a Previous Savepoint

```bash
# See all commits
git log --oneline

# Go back to a specific commit (creates a new branch)
git checkout <commit-hash>

# Or create a new branch from a commit
git checkout -b new-branch-name <commit-hash>

# Go back to latest (main branch)
git checkout main
```

## Common Workflows

### Daily Workflow

1. **Start working:**
   ```bash
   git status  # See what you're working on
   ```

2. **Make changes to files**

3. **Save your progress:**
   ```bash
   git add .
   git commit -m "Added feature X" 
   # or
   git commit -m "Fixed bug in report generation"
   ```

4. **Continue working and commit frequently!**

### Good Commit Messages

Write clear, descriptive commit messages:

✅ **Good:**
- `"Fixed PostCSS config syntax error"`
- `"Added Docker client service configuration"`
- `"Implemented AI summarization for IFTA reports"`
- `"Added user authentication with JWT"`

❌ **Bad:**
- `"fix"`
- `"changes"`
- `"update"`
- `"asdf"`

### Viewing History

```bash
# Simple one-line view
git log --oneline

# More detailed
git log

# With file changes
git log --stat

# Graph view
git log --graph --oneline --all
```

### Undoing Changes

```bash
# Undo changes to a file (before committing)
git checkout -- filename

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes) - BE CAREFUL!
git reset --hard HEAD~1
```

### Creating Branches (Advanced)

```bash
# Create a new branch for a feature
git checkout -b feature/new-feature

# Switch between branches
git checkout main
git checkout feature/new-feature

# Merge a branch
git checkout main
git merge feature/new-feature
```

## Best Practices

1. **Commit Frequently** - Save your work often (every 30-60 minutes)
2. **Write Clear Messages** - Describe what and why, not just what
3. **Commit Related Changes Together** - Group related file changes
4. **Test Before Committing** - Make sure your code works
5. **Don't Commit Sensitive Data** - `.env` files are already ignored

## Example Session

```bash
# Morning: Start working
git status

# Made some changes...
git add .
git commit -m "Fixed client container PostCSS config issue"

# Made more changes...
git add server/routes/notifications.js
git commit -m "Fixed notifications route export issue"

# End of day: All saved!
git log --oneline  # See your progress
```

## Connecting to GitHub (Optional)

If you want to backup to GitHub:

```bash
# Create a repo on GitHub first, then:
git remote add origin https://github.com/yourusername/ifta-summarizer.git
git branch -M main
git push -u origin main

# Future pushes
git push
```

## Current Status

Check your current status anytime:
```bash
git status
```

See what you've committed:
```bash
git log --oneline -10  # Last 10 commits
```
