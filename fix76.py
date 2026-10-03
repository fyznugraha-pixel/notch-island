import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Fix the wrappers around ScrollingText to have flex-1 min-w-0 so they don't stretch beyond max width

app = app.replace('className="flex flex-col justify-center overflow-hidden whitespace-nowrap"', 'className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0"')
app = app.replace('className="flex flex-col overflow-hidden"', 'className="flex flex-col overflow-hidden flex-1 min-w-0"')

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
