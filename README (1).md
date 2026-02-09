# ProfFlow UI - Ambient Outpost Theme

A retrofuturist productivity interface inspired by isolated research stations in stunning natural environments.

## Installation

### 1. Replace the main page

Copy `page.tsx` to your app directory:

```bash
cp page.tsx /path/to/profflow/app/page.tsx
```

### 2. Replace global styles

Copy `globals.css` to your app directory:

```bash
cp globals.css /path/to/profflow/app/globals.css
```

### 3. Add background images

Create a backgrounds directory in your public folder:

```bash
mkdir -p /path/to/profflow/public/backgrounds
```

Add your background images there. The default expected file is:
- `public/backgrounds/ambient-outpost.jpg`

You can add multiple backgrounds and modify the `AmbientBackground` component to cycle through them.

### 4. Install fonts (already in globals.css via Google Fonts)

The UI uses:
- **Outfit** - Clean geometric sans-serif for UI text
- **JetBrains Mono** - Technical monospace for data/timestamps

---

## Background Image Guidelines

### Style: "Ambient Outpost"

The visual language draws from:
- Cold War era research stations
- Arctic/Antarctic bases
- Remote observatories
- Decommissioned military installations
- Sci-fi frontier outposts

### Key Visual Elements

1. **Architecture**
   - Satellite dishes, radio towers, radar arrays
   - Brutalist concrete structures
   - Modular/prefab buildings
   - Industrial infrastructure (pipes, cables, generators)

2. **Environment**
   - Snow-covered mountains
   - Fjords and glaciers
   - Desert plains at golden hour
   - Misty forests
   - Aurora borealis
   - Dramatic cloud formations

3. **Atmosphere**
   - Moody, overcast lighting
   - Blue hour / golden hour
   - Fog, mist, snow
   - Warm interior lights contrasting cold exterior

4. **Human touches**
   - Coffee cups, workstations
   - Footprints in snow
   - Vehicle tracks
   - Smoke from chimneys
   - Small signs of habitation

### Recommended Sources

- **AI Generation**: Midjourney, DALL-E, Stable Diffusion
- **Stock**: Unsplash, Pexels (search: "research station", "arctic base", "observatory")
- **Reference Channels**: Ambient Outpost, Atmospheric Universe (YouTube)

### Sample Prompts for AI Generation

```
Arctic research station at twilight, satellite dishes and radio towers, 
snow-covered mountains in background, warm orange lights from windows, 
moody blue atmosphere, cinematic photography, 8k, ultra detailed
```

```
Abandoned Cold War era observatory in Norwegian fjord, brutalist architecture, 
radar equipment, misty mountains, golden hour lighting, atmospheric, 
photorealistic
```

```
Remote scientific outpost in Patagonian wilderness, modular buildings, 
communication towers with red warning lights, dramatic storm clouds, 
coffee cup in foreground, cozy isolated feeling
```

```
Soviet-era weather station in Siberian taiga, snow falling, warm interior 
glow, aurora borealis in sky, cinematic composition, 21:9 aspect ratio
```

### Image Specifications

- **Aspect Ratio**: 16:9 or 21:9 (ultrawide works well)
- **Resolution**: Minimum 1920x1080, ideally 2560x1440 or 3840x2160
- **Format**: JPG (for smaller file size) or WebP
- **Color Profile**: Slightly desaturated, cool tones with warm accent lights

---

## UI Components

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    [BACKGROUND IMAGE]                       │
│                                                             │
│ [TASK     ]                                   [SCHEDULE    ]│
│ [DRAWER   ]     [CHAT OVERLAY - toggleable]   [PANEL      ]│
│ [slides in]                                   [fixed right ]│
│                                                             │
│               ╔═════════════════════════╗                   │
│               ║    FOCUS TASK CARD      ║                   │
│               ╚═════════════════════════╝                   │
└─────────────────────────────────────────────────────────────┘
```

### Task Drawer (Left)
- Hidden by default
- Slides in from left edge
- Shows tasks grouped by category
- Click task to set as focus

### Chat Overlay (Center)
- Toggleable via floating button (bottom-right)
- Full conversation history
- Operation confirmation with checkboxes
- Calendar context input

### Schedule Panel (Right)
- Always visible
- Shows time-blocked schedule
- Current time indicator
- Color-coded by block type

### Focus Task Card (Bottom Center)
- Always visible
- Shows current priority task
- Quick complete action

---

## Customization

### Color Scheme

The theme uses a cold/warm contrast inspired by the arctic station aesthetic:

```css
/* Primary accent - tech/interface elements */
--cyan: 6 182 212

/* Secondary - warnings, shallow work */
--amber: 245 158 11

/* Categories */
--research: cyan
--teaching: amber
--family: rose
--health: emerald
```

### Modifying Glass Effect

Adjust the glass panel transparency in `globals.css`:

```css
.glass-panel {
  @apply bg-slate-900/70;  /* Adjust opacity (0.7 = 70%) */
  @apply backdrop-blur-xl; /* Adjust blur: sm, md, lg, xl, 2xl, 3xl */
}
```

### Adding Background Rotation

To cycle through multiple backgrounds, modify `AmbientBackground` in `page.tsx`:

```tsx
const BACKGROUNDS = [
  '/backgrounds/arctic-station.jpg',
  '/backgrounds/desert-observatory.jpg',
  '/backgrounds/fjord-base.jpg',
];

function AmbientBackground() {
  const [currentBg, setCurrentBg] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBg(prev => (prev + 1) % BACKGROUNDS.length);
    }, 60000); // Change every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-cover bg-center transition-opacity duration-2000"
      style={{ backgroundImage: `url('${BACKGROUNDS[currentBg]}')` }}
    />
  );
}
```

---

## Keyboard Shortcuts (TODO)

Future enhancement - add these keyboard shortcuts:

- `Cmd/Ctrl + K` - Open chat
- `Cmd/Ctrl + T` - Open task drawer
- `Cmd/Ctrl + Enter` - Confirm operations
- `Escape` - Close current overlay

---

## Performance Notes

- Background images should be optimized (use WebP, appropriate dimensions)
- Consider using `next/image` for automatic optimization
- The backdrop-blur effect can be GPU-intensive on large screens
- Test on target devices for smooth animations

---

## Version

ProfFlow UI v1.8 // Ambient Outpost Theme
