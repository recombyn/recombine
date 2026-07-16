from uuid import uuid4


def empty_document(width: int = 794, height: int = 1123) -> dict:
    root_id = "ROOT"
    return {
        "width": width,
        "height": height,
        "deltaSetLike": {
            root_id: {"key": "root", "children": []},
        },
    }


def create_text_node(
    text: str,
    x: float,
    y: float,
    width: float,
    height: float,
    font_size: float = 14,
    fill: str = "#333333",
) -> tuple[str, dict]:
    node_id = uuid4().hex
    return node_id, {
        "key": "text",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "attrs": {
            "ORIGIN_DATA": text,
            "DATA": {
                "chars": [{"char": c, "fontSize": font_size, "fill": fill} for c in text],
            },
        },
    }


def create_rect_node(
    x: float,
    y: float,
    width: float,
    height: float,
    fill: str = "#F5F5F5",
    border_color: str = "#D0D0D0",
) -> tuple[str, dict]:
    node_id = uuid4().hex
    return node_id, {
        "key": "rect",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "attrs": {
            "L": "true",
            "R": "true",
            "T": "true",
            "B": "true",
            "border-color": border_color,
            "border-width": 1,
            "fill-color": fill,
            "opacity": 1,
            "angle": 0,
            "radiusTL": 0,
            "radiusTR": 0,
            "radiusBR": 0,
            "radiusBL": 0,
        },
    }


def create_image_node(
    x: float,
    y: float,
    width: float,
    height: float,
    src: str = "",
) -> tuple[str, dict]:
    node_id = uuid4().hex
    return node_id, {
        "key": "image",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "attrs": {
            "src": src,
            "mode": "COVER",
        },
    }
