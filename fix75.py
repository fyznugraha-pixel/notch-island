import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

old_component = '''const ScrollingText = ({ text, className }: { text: string, className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    setShouldScroll(false);
    const timer = setTimeout(() => {
      if (containerRef.current && textRef.current) {
        setShouldScroll(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div className={shouldScroll ? "inline-block animate-marquee" : "w-full"}>
        <span ref={textRef} className={shouldScroll ? "inline-block pr-8" : "inline-block w-full truncate"}>{text}</span>
        {shouldScroll && <span className="inline-block pr-8">{text}</span>}
      </div>
    </div>
  );
};'''

new_component = '''const ScrollingText = ({ text, className }: { text: string, className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    // Reset to false first so it renders without animation/truncation for accurate measurement
    setShouldScroll(false);
    const timer = setTimeout(() => {
      if (containerRef.current && textRef.current) {
        setShouldScroll(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div className={shouldScroll ? "inline-block animate-marquee" : ""}>
        <span ref={textRef} className={shouldScroll ? "inline-block pr-8" : "inline-block"}>{text}</span>
        {shouldScroll && <span className="inline-block pr-8">{text}</span>}
      </div>
    </div>
  );
};'''

app = app.replace(old_component, new_component)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
