import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Fix the text containers for Wi-Fi and Bluetooth
app = app.replace(
    '<div className="flex flex-col justify-center overflow-hidden">\n                        <div className="flex items-center gap-1.5">\n                          <span className="text-[11px] font-semibold text-white leading-tight">Wi-Fi</span>',
    '<div className="flex flex-col justify-center overflow-hidden flex-1 min-w-0">\n                        <div className="flex items-center gap-1.5">\n                          <span className="text-[11px] font-semibold text-white leading-tight">Wi-Fi</span>'
)

app = app.replace(
    '<div className="flex flex-col justify-center overflow-hidden">\n                        <span className="text-[11px] font-semibold text-white leading-tight">Bluetooth</span>',
    '<div className="flex flex-col justify-center overflow-hidden flex-1 min-w-0">\n                        <span className="text-[11px] font-semibold text-white leading-tight">Bluetooth</span>'
)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
