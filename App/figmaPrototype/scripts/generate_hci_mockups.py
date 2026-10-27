from pathlib import Path


ROOT = Path(r"C:\Users\rokir\Desktop\SCUOLA CODE\SE2-MountainHut-Team09\App\figmaPrototype\exports\screens")
ROOT.mkdir(parents=True, exist_ok=True)


def rect(x, y, w, h, fill, stroke="#CBD5E1", rx=10, sw=1):
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{rx}' fill='{fill}' stroke='{stroke}' stroke-width='{sw}'/>"


def label(x, y, text, size=16, weight=600, color="#0F172A", anchor="start"):
    return (
        f"<text x='{x}' y='{y}' font-family='Inter, Arial, sans-serif' "
        f"font-size='{size}' font-weight='{weight}' fill='{color}' text-anchor='{anchor}'>{text}</text>"
    )


def button(x, y, w, h, text, primary=True):
    if primary:
        return (
            rect(x, y, w, h, "#2563EB", "#2563EB", 10)
            + label(x + w / 2, y + h / 2 + 6, text, 16, 700, "#FFFFFF", "middle")
        )
    return rect(x, y, w, h, "#FFFFFF", "#94A3B8", 10) + label(
        x + w / 2, y + h / 2 + 6, text, 15, 600, "#334155", "middle"
    )


def shell(title, subtitle, body):
    return "\n".join(
        [
            "<svg xmlns='http://www.w3.org/2000/svg' width='1440' height='1024' viewBox='0 0 1440 1024'>",
            rect(0, 0, 1440, 1024, "#F5F7FB", "#F5F7FB", 0),
            rect(14, 10, 1412, 1004, "#FFFFFF", "#D8E1EE", 22),
            rect(34, 26, 1372, 78, "#0F172A", "#0F172A", 18),
            label(60, 72, title, 26, 700, "#F8FAFC"),
            label(60, 94, subtitle, 14, 500, "#CBD5E1"),
            label(1306, 71, "HCI strict", 13, 700, "#A5B4FC", "end"),
            body,
            label(
                34,
                1003,
                "Visibility • Prevention • Consistency • Accessibility • Safe confirmation • Clear feedback",
                12,
                500,
                "#64748B",
            ),
            "</svg>",
        ]
    )


def add_fields(x, y, w, n, step=56):
    out = []
    for i in range(n):
        out.append(rect(x, y + i * step, w, 40, "#FFFFFF"))
    return "".join(out)


def layout_home(spec):
    body = "".join(
        [
            rect(44, 126, 900, 340, "#E0EAFF", "#BFDBFE", 16),
            label(78, 176, "Hero section", 30, 700, "#1E3A8A"),
            label(78, 214, "Value proposition + action shortcuts", 18, 500, "#1D4ED8"),
            button(78, 252, 220, 54, spec["primary"], True),
            button(316, 252, 240, 54, spec["secondary"], False),
            rect(970, 126, 410, 340, "#F8FAFC", "#E2E8F0", 16),
            label(996, 170, "Upcoming availability", 20, 700),
            rect(996, 190, 358, 76, "#FFFFFF"),
            rect(996, 278, 358, 76, "#FFFFFF"),
            rect(996, 366, 358, 76, "#FFFFFF"),
            rect(44, 486, 1336, 224, "#FFFFFF", "#E2E8F0", 14),
            label(76, 528, "How it works", 22, 700),
            rect(76, 552, 396, 132, "#F8FAFC"),
            rect(514, 552, 396, 132, "#F8FAFC"),
            rect(952, 552, 396, 132, "#F8FAFC"),
        ]
    )
    return shell(spec["title"], spec["subtitle"], body)


def layout_auth(spec, registration=False):
    fields = 6 if registration else 2
    body = "".join(
        [
            rect(454, 146, 532, 744, "#FFFFFF", "#D5DEEB", 18),
            label(486, 198, "Account Access" if not registration else "Create Account", 28, 700),
            add_fields(486, 236, 468, fields, 70),
            rect(486, 236 + fields * 70 + 8, 20, 20, "#FFFFFF", "#94A3B8", 4)
            if registration
            else "",
            label(516, 236 + fields * 70 + 24, "I accept privacy policy", 13, 500, "#334155")
            if registration
            else "",
            button(486, 650, 468, 52, spec["primary"], True),
            button(486, 716, 468, 52, spec["secondary"], False),
            rect(486, 790, 468, 54, "#ECFDF5", "#86EFAC", 8),
            label(720, 823, "Inline validation + keyboard-first order", 13, 600, "#166534", "middle"),
        ]
    )
    return shell(spec["title"], spec["subtitle"], body)


def layout_split(spec):
    body = "".join(
        [
            rect(44, 124, 1336, 82, "#FFFFFF", "#D8E1EE", 12),
            rect(72, 146, 220, 38, "#2563EB", "#2563EB", 10),
            label(182, 170, "Quick mode", 15, 700, "#FFFFFF", "middle"),
            rect(304, 146, 220, 38, "#FFFFFF", "#94A3B8", 10),
            label(414, 170, "Full mode", 15, 700, "#334155", "middle"),
            rect(44, 224, 656, 656, "#FFFFFF", "#D8E1EE", 12),
            label(72, 266, "Profile area", 22, 700),
            add_fields(72, 292, 600, 8, 64),
            rect(724, 224, 656, 656, "#FFFFFF", "#D8E1EE", 12),
            label(752, 266, "Booking area", 22, 700),
            add_fields(752, 292, 600, 8, 64),
            button(724, 898, 220, 52, spec["secondary"], False),
            button(1160, 898, 220, 52, spec["primary"], True),
        ]
    )
    return shell(spec["title"], spec["subtitle"], body)


def layout_wizard(spec):
    body = "".join(
        [
            rect(44, 124, 1336, 78, "#FFFFFF", "#D8E1EE", 12),
            rect(86, 146, 220, 30, "#EEF2FF", "#C7D2FE", 8),
            rect(334, 146, 220, 30, "#EEF2FF", "#C7D2FE", 8),
            rect(582, 146, 220, 30, "#EEF2FF", "#C7D2FE", 8),
            rect(830, 146, 220, 30, "#DBEAFE", "#93C5FD", 8),
            label(196, 167, "Step 1", 13, 700, "#1E3A8A", "middle"),
            label(444, 167, "Step 2", 13, 700, "#1E3A8A", "middle"),
            label(692, 167, "Step 3", 13, 700, "#1E3A8A", "middle"),
            label(940, 167, "Step 4", 13, 700, "#1E3A8A", "middle"),
            rect(44, 222, 848, 658, "#FFFFFF", "#D8E1EE", 12),
            rect(914, 222, 466, 658, "#F8FAFC", "#D8E1EE", 12),
            add_fields(72, 258, 792, 9, 62),
            add_fields(942, 258, 410, 10, 56),
            button(914, 898, 220, 52, spec["secondary"], False),
            button(1160, 898, 220, 52, spec["primary"], True),
        ]
    )
    return shell(spec["title"], spec["subtitle"], body)


def layout_table(spec):
    body = [rect(44, 124, 1336, 120, "#FFFFFF", "#D8E1EE", 12), add_fields(72, 182, 1220, 1, 0)]
    body += [rect(44, 262, 930, 618, "#FFFFFF", "#D8E1EE", 12), rect(994, 262, 386, 618, "#FFF7ED", "#FDBA74", 12)]
    x0, y0 = 72, 292
    for r in range(8):
        for c in range(6):
            body.append(rect(x0 + c * 146, y0 + r * 66, 136, 56, "#FFFFFF"))
    body.append(add_fields(1022, 296, 330, 10, 56))
    body.append(button(994, 898, 180, 52, spec["secondary"], False))
    body.append(button(1200, 898, 180, 52, spec["primary"], True))
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_cards(spec):
    body = [rect(44, 124, 1336, 98, "#FFFFFF", "#D8E1EE", 12), add_fields(72, 154, 1220, 1, 0), rect(44, 240, 1336, 640, "#FFFFFF", "#D8E1EE", 12)]
    x, y = 72, 268
    for i in range(12):
        body += [rect(x, y, 302, 188, "#F8FAFC"), rect(x + 20, y + 18, 262, 34, "#FFFFFF"), rect(x + 20, y + 64, 262, 70, "#FFFFFF"), button(x + 20, y + 144, 120, 30, "View", True)]
        x += 326
        if (i + 1) % 4 == 0:
            x = 72
            y += 204
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_dashboard(spec):
    body = [rect(44, 124, 1336, 170, "#FFFFFF", "#D8E1EE", 12)]
    for x in [72, 340, 608, 876, 1144]:
        body.append(rect(x, 184, 220, 90, "#ECFDF5", "#86EFAC", 10))
    body += [rect(44, 312, 902, 568, "#FFFFFF", "#D8E1EE", 12), rect(966, 312, 414, 568, "#FFF7ED", "#FDBA74", 12)]
    body += [
        "<polyline points='86,826 176,744 266,766 356,682 446,704 536,622 626,640 716,562 806,588 896,522' fill='none' stroke='#2563EB' stroke-width='5'/>",
        "<polyline points='86,848 176,808 266,788 356,768 446,748 536,728 626,708 716,688 806,668 896,648' fill='none' stroke='#94A3B8' stroke-width='3' stroke-dasharray='8 6'/>",
    ]
    body.append(add_fields(994, 344, 358, 9, 56))
    body.append(button(966, 898, 180, 52, spec["secondary"], False))
    body.append(button(1200, 898, 180, 52, spec["primary"], True))
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_timeline(spec):
    body = [
        rect(44, 124, 1336, 756, "#FFFFFF", "#D8E1EE", 12),
        "<line x1='170' y1='212' x2='170' y2='820' stroke='#93C5FD' stroke-width='6'/>",
    ]
    y = 224
    for _ in range(7):
        body += [f"<circle cx='170' cy='{y}' r='12' fill='#2563EB'/>", rect(210, y - 26, 1138, 54, "#F8FAFC")]
        y += 88
    body += [
        rect(44, 896, 900, 82, "#ECFDF5", "#86EFAC", 12),
        label(70, 944, "Email sent • SMS pending • In-app delivered", 17, 600, "#166534"),
        button(970, 912, 180, 52, spec["secondary"], False),
        button(1176, 912, 204, 52, spec["primary"], True),
    ]
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_danger(spec):
    body = [
        rect(44, 124, 1336, 782, "#FEF2F2", "#FCA5A5", 12),
        rect(72, 192, 1290, 300, "#FFFFFF", "#FCA5A5", 12),
        rect(72, 516, 1290, 362, "#FFFFFF", "#FCA5A5", 12),
        add_fields(100, 228, 1234, 5, 52),
        add_fields(100, 552, 1234, 6, 52),
        button(72, 916, 220, 52, spec["secondary"], False),
        button(1140, 916, 220, 52, spec["primary"], True),
    ]
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_calendar(spec):
    body = [rect(44, 124, 1336, 130, "#FFFFFF", "#D8E1EE", 12), add_fields(72, 184, 1220, 1, 0), rect(44, 272, 936, 608, "#FFFFFF", "#D8E1EE", 12), rect(1000, 272, 380, 608, "#FFF7ED", "#FDBA74", 12)]
    x = 72
    for _ in range(7):
        body.append(rect(x, 330, 124, 530, "#F8FAFC"))
        y = 364
        for _ in range(8):
            body.append(rect(x + 8, y, 108, 52, "#FFFFFF"))
            y += 62
        x += 132
    body.append(add_fields(1028, 330, 324, 10, 52))
    body.append(button(1000, 898, 180, 52, spec["secondary"], False))
    body.append(button(1200, 898, 180, 52, spec["primary"], True))
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_kanban(spec):
    body = [rect(44, 124, 1336, 82, "#FFFFFF", "#D8E1EE", 12), add_fields(72, 154, 1220, 1, 0), rect(44, 224, 1336, 656, "#FFFFFF", "#D8E1EE", 12)]
    for x in [72, 402, 732, 1062]:
        body.append(rect(x, 254, 300, 596, "#F8FAFC"))
        y = 296
        for _ in range(8):
            body.append(rect(x + 20, y, 260, 56, "#FFFFFF"))
            y += 68
    body.append(button(960, 898, 180, 52, spec["secondary"], False))
    body.append(button(1200, 898, 180, 52, spec["primary"], True))
    return shell(spec["title"], spec["subtitle"], "".join(body))


def layout_table_ops(spec):
    body = [rect(44, 124, 1336, 98, "#FFFFFF", "#D8E1EE", 12), add_fields(72, 154, 1220, 1, 0), rect(44, 240, 1336, 640, "#FFFFFF", "#D8E1EE", 12), rect(72, 304, 1280, 50, "#EEF2FF", "#C7D2FE", 8)]
    y = 364
    for i in range(10):
        body.append(rect(72, y, 1280, 46, "#FFFFFF" if i % 2 == 0 else "#F8FAFC"))
        body.append(rect(1220, y + 8, 120, 30, "#2563EB", "#2563EB", 6))
        y += 52
    body.append(button(950, 898, 200, 52, spec["secondary"], False))
    body.append(button(1170, 898, 210, 52, spec["primary"], True))
    return shell(spec["title"], spec["subtitle"], "".join(body))


def render(spec):
    kind = spec["kind"]
    if kind == "home":
        return layout_home(spec)
    if kind == "login":
        return layout_auth(spec, False)
    if kind == "registration":
        return layout_auth(spec, True)
    if kind in {"wizard", "edit"}:
        return layout_wizard(spec) if kind == "wizard" else layout_split(spec)
    if kind in {"capacity", "validator"}:
        return layout_table(spec)
    if kind == "confirmation":
        return layout_danger({**spec, "primary": spec["primary"], "secondary": spec["secondary"]}).replace("#FEF2F2", "#ECFDF5").replace("#FCA5A5", "#86EFAC")
    if kind in {"availability", "menu-details"}:
        return layout_cards(spec)
    if kind in {"requirements", "operator", "employee-edit"}:
        return layout_split(spec)
    if kind in {"cancel", "warden-cancel", "close-slot"}:
        return layout_danger(spec)
    if kind in {"repeat-week", "waitlist"}:
        return layout_calendar(spec)
    if kind == "define-menus":
        return layout_kanban(spec)
    if kind == "occupancy":
        return layout_dashboard(spec)
    if kind == "updates":
        return layout_timeline(spec)
    if kind == "affected":
        return layout_table_ops(spec)
    if kind == "modify-slot":
        return layout_table(spec)
    return shell(spec["title"], spec["subtitle"], rect(44, 124, 1336, 756, "#FFFFFF", "#D8E1EE", 12))


SCREENS = [
    ("00-home.svg", "00 Home", "Discovery and entry point", "home", "Book now", "Check availability"),
    ("01-login.svg", "01 Login", "Secure sign-in", "login", "Login", "Forgot password"),
    ("02-registration.svg", "02 Registration", "Create account", "registration", "Create account", "Back to login"),
    ("03-mh01-book-a-table.svg", "03 MH-01 Book a table", "4-step booking flow", "wizard", "Confirm booking", "Back"),
    ("04-mh02-define-slot-capacity.svg", "04 MH-02 Define slot capacity", "Employee capacity setup", "capacity", "Save rules", "Discard"),
    ("05-mh03-receive-confirmation.svg", "05 MH-03 Receive confirmation", "Success and notification status", "confirmation", "Back to home", "Edit booking"),
    ("06-mh04-check-availability.svg", "06 MH-04 Check availability", "Search available slots", "availability", "Book slot", "Refine search"),
    ("07-mh05-party-requirements.svg", "07 MH-05 Party requirements", "Per-member constraints", "requirements", "Save requirements", "Skip"),
    ("08-mh06-change-booking.svg", "08 MH-06 Change booking", "Reservation update", "edit", "Save changes", "Cancel edit"),
    ("09-mh07-reserve-for-hiker.svg", "09 MH-07 Reserve for hiker", "Operator-assisted reservation", "operator", "Create reservation", "Quick mode"),
    ("10-mh08-cancel-booking.svg", "10 MH-08 Cancel booking", "Safe destructive action", "cancel", "Confirm cancel", "Keep booking"),
    ("11-mh09-repeat-weekly-schedule.svg", "11 MH-09 Repeat weekly schedule", "Weekly planner", "repeat-week", "Confirm repeat", "Review conflicts"),
    ("12-mh10-define-menus.svg", "12 MH-10 Define menus", "Menu composer", "define-menus", "Publish menu", "Save draft"),
    ("13-mh11-view-meal-details.svg", "13 MH-11 View meal details", "Meal cards", "menu-details", "Continue booking", "Change date"),
    ("14-mh12-monitor-occupancy.svg", "14 MH-12 Monitor occupancy", "Capacity dashboard", "occupancy", "Refresh", "Export"),
    ("15-mh13-change-reservation-employee.svg", "15 MH-13 Change reservation", "Employee edits with checks", "employee-edit", "Apply changes", "Preview impact"),
    ("16-mh14-receive-updates.svg", "16 MH-14 Receive updates", "Timeline and diff", "updates", "Acknowledge", "Re-plan"),
    ("17-mh15-cancel-reservation-warden.svg", "17 MH-15 Cancel reservation", "Warden cancellation", "warden-cancel", "Cancel reservation", "Back"),
    ("18-mh16-join-waiting-list.svg", "18 MH-16 Join waiting list", "Queue entry", "waitlist", "Join waiting list", "Edit details"),
    ("19-mh17-close-slot.svg", "19 MH-17 Close slot", "Bulk cancellation operation", "close-slot", "Close slot", "Abort"),
    ("20-mh18-handle-affected-bookings.svg", "20 MH-18 Handle affected bookings", "Affected list operations", "affected", "Contact selected", "Suggest rebooking"),
    ("21-mh19-modify-slot.svg", "21 MH-19 Modify slot", "Integrity-safe slot update", "modify-slot", "Apply update", "Use suggestion"),
]


for file_name, title, subtitle, kind, primary, secondary in SCREENS:
    svg = render(
        {
            "title": title,
            "subtitle": subtitle,
            "kind": kind,
            "primary": primary,
            "secondary": secondary,
        }
    )
    (ROOT / file_name).write_text(svg, encoding="utf-8")

print(f"Generated {len(SCREENS)} HCI mockups in {ROOT}")
