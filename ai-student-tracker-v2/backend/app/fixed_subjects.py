# Fixed curriculum subjects (IDs 1–5). Teachers cannot add/remove subjects in UI.

FIXED_SUBJECTS = [
    {"id": 1, "name": "Mathematics", "code": "AST_MATH", "class_name": "ALL", "icon": "🔢", "color": "#4F46E5"},
    {"id": 2, "name": "Science", "code": "AST_SCI", "class_name": "ALL", "icon": "🔬", "color": "#0EA5E9"},
    {"id": 3, "name": "English", "code": "AST_ENG", "class_name": "ALL", "icon": "📖", "color": "#10B981"},
    {"id": 4, "name": "Social Studies", "code": "AST_SST", "class_name": "ALL", "icon": "🌍", "color": "#F59E0B"},
    {"id": 5, "name": "Computer Science", "code": "AST_CS", "class_name": "ALL", "icon": "💻", "color": "#8B5CF6"},
]

FIXED_SUBJECTS_BY_ID = {s["id"]: s for s in FIXED_SUBJECTS}

# Normalized CSV/Excel header -> subject id
SUBJECT_HEADER_TO_ID = {
    "math": 1,
    "mathematics": 1,
    "science": 2,
    "english": 3,
    "social_studies": 4,
    "social": 4,
    "computer": 5,
    "computer_science": 5,
}
