from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
import textwrap


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "guide_visuals"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1800, 1120
NAVY = "#17365D"
BLUE = "#DCE6F1"
LIGHT = "#F4F7FA"
MID = "#A7BDD3"
TEXT = "#1F2933"
WHITE = "#FFFFFF"
GREEN = "#2E7D32"
YELLOW = "#E0A800"
RED = "#C62828"
GRAY = "#5F6B76"


def font(size=42, bold=False):
    name = "arialbd.ttf" if bold else "arial.ttf"
    path = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(path), size=size)


F_TITLE = font(52, True)
F_SUB = font(32, True)
F_BODY = font(29, False)
F_SMALL = font(25, False)
F_SMALL_B = font(25, True)


def canvas(title, subtitle=""):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.text((70, 45), title, fill=TEXT, font=F_TITLE)
    if subtitle:
        d.text((72, 112), subtitle, fill=GRAY, font=F_SMALL)
    return img, d


def wrapped(draw, text, box, fnt=F_BODY, fill=TEXT, align="center", spacing=8):
    x1, y1, x2, y2 = box
    max_width = x2 - x1 - 34
    lines = []
    for block in text.split("\n"):
        if block == "":
            lines.append("")
            continue
        words = block.split()
        line = ""
        for word in words:
            trial = word if not line else line + " " + word
            if draw.textlength(trial, font=fnt) <= max_width:
                line = trial
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)
    line_h = fnt.size + spacing
    total_h = len(lines) * line_h - spacing
    y = y1 + max(10, (y2 - y1 - total_h) / 2)
    for line in lines:
        length = draw.textlength(line, font=fnt)
        if align == "left":
            x = x1 + 18
        else:
            x = x1 + (x2 - x1 - length) / 2
        draw.text((x, y), line, fill=fill, font=fnt)
        y += line_h


def box(draw, xy, title, detail="", fill=LIGHT, outline=NAVY, title_color=NAVY, radius=22):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=4)
    x1, y1, x2, y2 = xy
    if detail:
        wrapped(draw, title, (x1 + 10, y1 + 8, x2 - 10, y1 + 62), F_SUB, title_color)
        wrapped(draw, detail, (x1 + 20, y1 + 62, x2 - 20, y2 - 12), F_SMALL, TEXT)
    else:
        wrapped(draw, title, xy, F_SUB, title_color)


def arrow(draw, start, end, color=NAVY, width=7, label=None):
    draw.line([start, end], fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 23
    spread = 0.55
    pts = [
        end,
        (end[0] - length * math.cos(angle - spread), end[1] - length * math.sin(angle - spread)),
        (end[0] - length * math.cos(angle + spread), end[1] - length * math.sin(angle + spread)),
    ]
    draw.polygon(pts, fill=color)
    if label:
        mx, my = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
        bbox = draw.textbbox((0, 0), label, font=F_SMALL_B)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.rounded_rectangle((mx - tw/2 - 10, my - th/2 - 7, mx + tw/2 + 10, my + th/2 + 7), 8, fill=WHITE)
        draw.text((mx - tw/2, my - th/2 - 2), label, font=F_SMALL_B, fill=color)


def save(img, name):
    path = OUT / name
    img.save(path, dpi=(220, 220))
    print(path)


# 1 System architecture
img, d = canvas("How the Parts Work Together", "A request moves downward. The stock result returns to the screen.")
items = [
    ("Student", "Chooses a category and size; gender only for Formal Uniform"),
    ("Kiosk Screen", "Shows the webpage and the final result"),
    ("ESP32", "Receives the webpage request and forwards it"),
    ("Arduino Uno", "Reads stock, decides the status, and controls hardware"),
    ("Physical Output", "Green, yellow, or red LED; buzzer and assistance button"),
]
x1, x2 = 390, 1410
y = 185
boxes = []
for i, (t, detail) in enumerate(items):
    height = 128 if i < 4 else 138
    xy = (x1, y, x2, y + height)
    box(d, xy, t, detail, fill=WHITE if i % 2 == 0 else BLUE)
    boxes.append(xy)
    y += height + 48
for a, b in zip(boxes, boxes[1:]):
    arrow(d, ((a[0] + a[2]) / 2, a[3] + 5), ((b[0] + b[2]) / 2, b[1] - 5), label="request")
d.text((1440, 500), "RESULT", font=F_SMALL_B, fill=GREEN)
arrow(d, (1450, 850), (1450, 260), color=GREEN, width=8)
save(img, "01_system_architecture.png")


# 2 Request journey
img, d = canvas("What Happens During One Stock Check", "Example request: School T-Shirt, Medium")
cols = [(90, 390, "Student"), (510, 810, "Browser"), (930, 1230, "ESP32"), (1350, 1650, "Arduino Uno")]
for x1, x2, t in cols:
    box(d, (x1, 170, x2, 270), t, fill=BLUE)
    d.line(((x1+x2)/2, 275, (x1+x2)/2, 1010), fill=MID, width=4)
steps = [
    (350, 240, 660, "Select item and size"),
    (465, 660, 1080, "GET /check"),
    (580, 1080, 1500, "GET|T_SHIRT|M"),
    (710, 1500, 1080, "STOCK|12|AVAILABLE"),
    (825, 1080, 660, "Return result"),
    (940, 660, 240, "Show 12 pieces and green status"),
]
for y, xstart, xend, label in steps:
    arrow(d, (xstart, y), (xend, y), color=GREEN if xend < xstart else NAVY, label=label)
save(img, "02_request_journey.png")


# 3 Stock decision
img, d = canvas("How the Arduino Decides the Stock Status", "The same quantity rules must be used by the program, screen, and LEDs.")
box(d, (610, 165, 1190, 285), "Read the stored quantity", fill=BLUE)
arrow(d, (900, 290), (900, 360))
box(d, (650, 365, 1150, 475), "Is the quantity from 4 to 30", fill=WHITE)
arrow(d, (650, 420), (400, 420), color=GREEN, label="YES")
box(d, (80, 350, 400, 495), "AVAILABLE", "Turn on the green LED", fill="#E8F5E9", outline=GREEN, title_color=GREEN)
arrow(d, (900, 480), (900, 555), label="NO")
box(d, (650, 560, 1150, 670), "Is the quantity 1 to 3", fill=WHITE)
arrow(d, (650, 615), (400, 615), color=YELLOW, label="YES")
box(d, (80, 545, 400, 690), "LOW STOCK", "Turn on the yellow LED", fill="#FFF8E1", outline=YELLOW, title_color="#9A6A00")
arrow(d, (900, 675), (900, 760), label="NO")
box(d, (650, 765, 1150, 910), "OUT OF STOCK", "Quantity is 0. Turn on the red LED", fill="#FFEBEE", outline=RED, title_color=RED)
box(d, (1270, 380, 1720, 850), "Important", "Checking stock only reads the quantity. It never subtracts an item. Only an administrator update can change the stored value.", fill=LIGHT, outline=GRAY, title_color=TEXT)
save(img, "03_stock_decision.png")


# 4 Wiring overview
img, d = canvas("Beginner Wiring Overview", "Suggested pins for the prototype. Disconnect power before changing wires.")
box(d, (620, 350, 1180, 720), "Arduino Uno", "D2 button\nD6 green LED\nD7 yellow LED\nD8 red LED\nD9 buzzer\nD10 RX and D11 TX", fill=BLUE)
left = [
    ((80, 210, 430, 320), "Assistance Button", "D2 to button to GND"),
    ((80, 380, 430, 490), "Status LEDs", "D6, D7, D8 through 220 ohm resistors"),
    ((80, 550, 430, 660), "Buzzer Circuit", "D9 through a transistor if required"),
]
for xy, t, det in left:
    box(d, xy, t, det, fill=WHITE)
    arrow(d, (xy[2] + 5, (xy[1]+xy[3])/2), (615, (xy[1]+xy[3])/2))
box(d, (1370, 340, 1720, 720), "ESP32", "GPIO17 TX to Uno D10 RX\n\nUno D11 TX to GPIO16 RX through safe level conversion\n\nConnect GND to GND", fill=WHITE)
arrow(d, (1185, 480), (1365, 480), label="3.3 V TX")
arrow(d, (1365, 620), (1185, 620), color=RED, label="protect 5 V TX")
box(d, (440, 840, 1360, 1010), "Voltage Safety", "The Arduino Uno uses 5 V logic. The ESP32 uses 3.3 V logic. Never connect the Uno TX output directly to an ESP32 input. Use a logic-level converter or a verified voltage divider.", fill="#FFEBEE", outline=RED, title_color=RED)
save(img, "04_wiring_overview.png")


# 5 Student screens
img, d = canvas("Student Screen Flow", "Formal: choose Male or Female. School T-Shirt and PE Uniform: no gender question.")
box(d, (45, 220, 305, 380), "1 Home", "Start the stock check", fill=BLUE)
box(d, (370, 195, 720, 405), "2 Category", "Formal Uniform\nSchool T-Shirt\nPE Uniform", fill=WHITE)
arrow(d, (310, 300), (365, 300))

box(d, (830, 185, 1200, 365), "3-4 Formal path", "Choose Male or Female,\nthen choose the garment", fill="#E8F5E9", outline=GREEN, title_color=GREEN)
box(d, (830, 455, 1200, 615), "Unisex path", "T-Shirt or PE Uniform:\nskip screens 3 and 4", fill="#EAF2FF", outline=NAVY, title_color=NAVY)
arrow(d, (725, 255), (825, 250), color=GREEN, label="FORMAL")
arrow(d, (725, 345), (825, 520), color=NAVY, label="UNISEX")

box(d, (1330, 300, 1720, 480), "5 Size", "Choose XS to XXL", fill=WHITE)
arrow(d, (1205, 275), (1325, 350), color=GREEN)
arrow(d, (1205, 535), (1325, 430), color=NAVY)

box(d, (900, 700, 1250, 865), "6 Confirm", "Review item and size", fill=WHITE)
box(d, (1400, 700, 1750, 865), "7 Result", "Read quantity and status", fill=BLUE)
arrow(d, (1525, 485), (1075, 695), label="CONTINUE")
arrow(d, (1255, 782), (1395, 782))
box(d, (220, 925, 1580, 1065), "After the Result", "Check Another returns to Category. Home clears all choices. If the Arduino does not respond, show an error and Retry instead of an incorrect stock result.", fill=LIGHT, outline=GRAY, title_color=TEXT)
save(img, "05_student_screen_flow.png")


# 6 Admin update flow
img, d = canvas("Administrator Stock Update", "An update is complete only after the Arduino confirms the saved quantity.")
steps = [
    ("1 Login", "Enter the prototype PIN"),
    ("2 Select", "Choose category and size; gender only for Formal"),
    ("3 View", "Read the current quantity"),
    ("4 Enter", "Type a new whole number"),
    ("5 Save", "ESP32 sends a SET command"),
    ("6 Confirm", "Arduino saves and replies UPDATED"),
]
positions = [(80, 220, 530, 380), (670, 220, 1120, 380), (1260, 220, 1710, 380),
             (80, 660, 530, 820), (670, 660, 1120, 820), (1260, 660, 1710, 820)]
for i, ((title, detail), xy) in enumerate(zip(steps, positions)):
    box(d, xy, title, detail, fill=BLUE if i in (0, 5) else WHITE)
arrow(d, (535, 300), (665, 300))
arrow(d, (1125, 300), (1255, 300))
arrow(d, (1485, 385), (305, 655), label="continue")
arrow(d, (535, 740), (665, 740))
arrow(d, (1125, 740), (1255, 740))
box(d, (470, 880, 1330, 1065), "Validation Rule", "Reject blank, negative, decimal, out-of-range, or unknown values. Keep the old quantity when an update is invalid.", fill="#FFF8E1", outline=YELLOW, title_color="#7A5600")
save(img, "06_admin_update_flow.png")
