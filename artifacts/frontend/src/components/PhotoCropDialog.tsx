import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn } from "lucide-react";

const FRAME_SIZE = 280;
const OUTPUT_SIZE = 512;

interface PhotoCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

export default function PhotoCropDialog({ open, imageSrc, onCancel, onConfirm }: PhotoCropDialogProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  useEffect(() => {
    if (!open || !imageSrc) {
      setImg(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    el.src = imageSrc;
  }, [open, imageSrc]);

  if (!open || !imageSrc) return null;

  const baseScale = img ? FRAME_SIZE / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const displayWidth = img ? img.naturalWidth * scale : FRAME_SIZE;
  const displayHeight = img ? img.naturalHeight * scale : FRAME_SIZE;
  const maxOffsetX = Math.max(0, (displayWidth - FRAME_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - FRAME_SIZE) / 2);

  function clampOffset(x: number, y: number) {
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.startOffset.x + dx, dragState.current.startOffset.y + dy));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleZoomChange(values: number[]) {
    const nextZoom = values[0] ?? 1;
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y));
  }

  function handleConfirm() {
    if (!img) return;
    const sourceSize = FRAME_SIZE / scale;
    const sourceX = (img.naturalWidth - sourceSize) / 2 - offset.x / scale;
    const sourceY = (img.naturalHeight - sourceSize) / 2 - offset.y / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rogner la photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative overflow-hidden rounded-full bg-gray-100 touch-none cursor-move select-none"
            style={{ width: FRAME_SIZE, height: FRAME_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {img && (
              <img
                src={imageSrc}
                alt="Aperçu à rogner"
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  left: (FRAME_SIZE - displayWidth) / 2 + offset.x,
                  top: (FRAME_SIZE - displayHeight) / 2 + offset.y,
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-3 w-full px-2">
            <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" />
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={[zoom]}
              onValueChange={handleZoomChange}
            />
          </div>
          <p className="text-xs text-gray-500 text-center">Déplacez l'image et ajustez le zoom pour cadrer votre photo.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
          <Button type="button" onClick={handleConfirm} disabled={!img}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
