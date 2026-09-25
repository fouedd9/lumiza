"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { ResolvedProductMedia } from "../data/product-media";

type ProductGalleryProps = {
  media: ResolvedProductMedia[];
  activeId: string;
  onActiveChange: (id: string) => void;
  labels: {
    gallery: string;
    previous: string;
    next: string;
    expand: string;
    close: string;
  };
};

export function ProductGallery({
  media,
  activeId,
  onActiveChange,
  labels,
}: ProductGalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const activeIndex = Math.max(
    0,
    media.findIndex((item) => item.id === activeId),
  );
  const activeMedia = media[activeIndex];

  function move(direction: -1 | 1) {
    const nextIndex = (activeIndex + direction + media.length) % media.length;
    onActiveChange(media[nextIndex].id);
  }

  function closeExpanded() {
    setExpanded(false);
    requestAnimationFrame(() => expandButtonRef.current?.focus());
  }

  useEffect(() => {
    if (!expanded) return;

    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeExpanded();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <div aria-label={labels.gallery} role="region" data-product-gallery>
      <div
        tabIndex={0}
        aria-label={activeMedia.alt}
        className="border-border bg-surface focus-visible:outline-primary relative aspect-square overflow-hidden rounded-[1.75rem] border focus-visible:outline-2 focus-visible:outline-offset-2"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") move(-1);
          if (event.key === "ArrowRight") move(1);
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX;
          if (
            touchStartX.current !== null &&
            end !== undefined &&
            Math.abs(end - touchStartX.current) > 45
          )
            move(end < touchStartX.current ? 1 : -1);
          touchStartX.current = null;
        }}
      >
        <Image
          src={activeMedia.src}
          alt={activeMedia.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 50vw"
          className="object-contain p-6 sm:p-10"
        />
        <button
          ref={expandButtonRef}
          type="button"
          onClick={() => setExpanded(true)}
          className="bg-surface-elevated/90 text-foreground focus-visible:outline-primary absolute top-4 right-4 grid size-11 place-items-center rounded-full font-bold backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-3"
          aria-label={labels.expand}
        >
          ↗
        </button>
        <div className="absolute right-4 bottom-4 flex gap-2">
          <button
            className="gallery-arrow"
            type="button"
            onClick={() => move(-1)}
            aria-label={labels.previous}
          >
            ←
          </button>
          <button
            className="gallery-arrow"
            type="button"
            onClick={() => move(1)}
            aria-label={labels.next}
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {media.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.alt}
            aria-current={item.id === activeMedia.id ? "true" : undefined}
            onClick={() => onActiveChange(item.id)}
            className="border-border bg-surface aria-current:border-primary focus-visible:outline-primary relative aspect-[4/3] overflow-hidden rounded-2xl border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Image
              src={item.src}
              alt=""
              fill
              sizes="(max-width: 1023px) 30vw, 16vw"
              className="object-contain p-2"
            />
          </button>
        ))}
      </div>

      {expanded ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeMedia.alt}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 sm:p-10"
        >
          <div className="relative h-full max-h-[90vh] w-full max-w-5xl">
            <Image
              src={activeMedia.src}
              alt={activeMedia.alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeExpanded}
              className="focus-visible:outline-primary absolute top-3 right-3 grid size-12 place-items-center rounded-full bg-white text-xl font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-3"
              aria-label={labels.close}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
