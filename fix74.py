import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Replace all instances of `truncate` media titles and artists with ScrollingText

# Instance 1: media_expanded title and artist
old_1 = '<span className="text-lg font-bold truncate leading-tight">{media!.title}</span>'
new_1 = '<ScrollingText text={media!.title} className="text-lg font-bold leading-tight" />'
app = app.replace(old_1, new_1)

old_2 = '<span className="text-sm text-pink-400 truncate leading-tight">{media!.artist}</span>'
new_2 = '<ScrollingText text={media!.artist} className="text-sm text-pink-400 leading-tight" />'
app = app.replace(old_2, new_2)

# Instance 3: idle and small variants media title and artist
old_3 = '<span className="text-sm font-semibold truncate leading-tight">{media!.title}</span>'
new_3 = '<ScrollingText text={media!.title} className="text-sm font-semibold leading-tight" />'
app = app.replace(old_3, new_3)

old_4 = '<span className="text-[11px] text-neutral-400 truncate leading-tight">{media!.artist}</span>'
new_4 = '<ScrollingText text={media!.artist} className="text-[11px] text-neutral-400 leading-tight" />'
app = app.replace(old_4, new_4)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
