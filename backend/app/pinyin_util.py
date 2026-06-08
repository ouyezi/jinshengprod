from pypinyin import Style, lazy_pinyin


def name_to_pinyin_keys(name: str) -> str:
    """全拼 + 首字母，用于模糊搜索（如 zhangsan / zs）。"""
    name = name.strip()
    if not name:
        return ""
    full = "".join(lazy_pinyin(name, style=Style.NORMAL))
    initials = "".join(lazy_pinyin(name, style=Style.FIRST_LETTER))
    return f"{full} {initials}".lower()
