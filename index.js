from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageEnhance, ImageFilter
from rembg import remove
from io import BytesIO
import numpy as np
import cv2
import uuid, os

app = FastAPI()
os.makedirs("output", exist_ok=True)
os.makedirs("templates", exist_ok=True)  # Certifique que templates existem

TEMPLATES = {
    "camisa": "templates/shirt.png",
    "calca": "templates/pants.png",
    "hoodie": "templates/hoodie.png"
}

# ---------------- FUNÇÕES AUXILIARES ---------------- #

def clean_alpha(img: Image.Image, alpha_thresh=10):
    arr = np.array(img)
    arr[arr[:, :, 3] < alpha_thresh] = [0,0,0,0]
    return Image.fromarray(arr)

def straighten_image(img: Image.Image):
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2GRAY)
    coords = cv2.findNonZero((gray>0).astype(np.uint8))
    if coords is None:
        return img
    rect = cv2.minAreaRect(coords)
    angle = rect[-1]
    if angle < -45:
        angle = 90 + angle
    return img.rotate(-angle, expand=True)

def detect_clothing_area(img: Image.Image, min_area=500):
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2BGRA)
    alpha = img_cv[:, :, 3]
    _, thresh = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img
    contours = [c for c in contours if cv2.contourArea(c) > min_area]
    if not contours:
        return img
    c = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    return img.crop((x, y, x+w, y+h))

def add_shadow(template, img, offset=(5,5), blur_radius=5):
    shadow = Image.new("RGBA", template.size, (0,0,0,0))
    shadow_img = img.copy().convert("RGBA")
    shadow_img = ImageEnhance.Brightness(shadow_img).enhance(0)
    shadow.paste(shadow_img, (offset[0], offset[1]), shadow_img)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
    return Image.alpha_composite(shadow, template)

def fit_image_to_template(img: Image.Image, template: Image.Image,
                          padding=20, x_offset=0, y_offset=0, scale_factor=1.0):
    img = clean_alpha(img)
    img = straighten_image(img)
    img = detect_clothing_area(img)

    img = img.resize((int(img.width*scale_factor), int(img.height*scale_factor)), Image.ANTIALIAS)
    warp_factor = 1.05
    img = img.resize((int(img.width*warp_factor), img.height), Image.ANTIALIAS)

    x = (template.width - img.width)//2 + x_offset
    y = (template.height - img.height)//2 + y_offset

    template = add_shadow(template, img)
    img = img.filter(ImageFilter.GaussianBlur(radius=1))
    template.paste(img, (x, y), img)
    return template

# ----------------- ENDPOINT ----------------- #

@app.post("/process")
async def process_image(
    file: UploadFile = File(...),
    tipo: str = "camisa",
    brilho: float = 1.1,
    contraste: float = 1.1,
    modo: str = "normal",
    upscale: str = "none",
    auto_align: str = "false",
    preview: str = "false"
):
    tipo = tipo.lower()
    if tipo not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Tipo inválido: {tipo}")

    try:
        img = Image.open(file.file).convert("RGBA")
        max_size = (1024, 1024)
        img.thumbnail(max_size, Image.ANTIALIAS)
    except Exception:
        raise HTTPException(status_code=400, detail="Arquivo inválido")

    try:
        img_bytes = remove(img)
        img = Image.open(BytesIO(img_bytes)).convert("RGBA")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover fundo: {str(e)}")

    # brilho e contraste
    img = ImageEnhance.Brightness(img).enhance(brilho)
    img = ImageEnhance.Contrast(img).enhance(contraste)

    template_path = TEMPLATES[tipo]
    if not os.path.exists(template_path):
        raise HTTPException(status_code=500, detail="Template não encontrado")

    template = Image.open(template_path).convert("RGBA")

    # Upscale e auto_align são apenas placeholders aqui
    # Você pode integrar modelos avançados de IA futuramente
    scale_factor = 1.0
    if upscale.lower() == "4x":
        scale_factor = 1.0  # já processamos proporcionalmente

    if auto_align.lower() == "true":
        # alinhamento extra: já fazemos straighten e detect_clothing_area
        pass

    template = fit_image_to_template(img, template, scale_factor=scale_factor)

    uid = str(uuid.uuid4())
    out_path = f"output/{uid}.png"
    template.save(out_path)

    return {
        "template_url": f"/file/{uid}.png",
        "preview_url": f"/file/{uid}.png"
    }

@app.get("/file/{name}")
def get_file(name: str):
    file_path = f"output/{name}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return FileResponse(file_path)
