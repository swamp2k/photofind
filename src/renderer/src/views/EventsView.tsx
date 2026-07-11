import { useCallback, useMemo, useState } from 'react'
import { clusterEvents, type EventPhoto } from '../../../shared/events'
import type { EventGroup, Verdict } from '../../../shared/types'
import { Lightbox } from '../components/Lightbox'
import { SpecialDatesManager } from '../components/SpecialDatesManager'
import type { CurateSession } from '../hooks/useCurateSession'
import { useSpecialDates } from '../hooks/useSpecialDates'

export function EventsView({ session }: { session: CurateSession }): JSX.Element {
  const specialDates = useSpecialDates()
  const { result } = session
  const [lightbox, setLightbox] = useState<{ event: EventGroup; path: string } | null>(null)

  const clustering = useMemo(() => {
    if (!result) return null
    const photos: EventPhoto[] = result.photos.map((photo) => ({
      mediaPath: photo.media.path,
      captureTimeMs: photo.capture.captureTimeMs,
      gps: photo.capture.gps
    }))
    return clusterEvents(photos, specialDates.dates)
  }, [result, specialDates.dates])

  const photoByPath = useMemo(() => new Map(result?.photos.map((photo) => [photo.media.path, photo]) ?? []), [result])
  const thumbnailByPath = useMemo(
    () => new Map(result?.thumbnails.items.map((item) => [item.mediaPath, item]) ?? []),
    [result]
  )

  const moveLightbox = useCallback(
    (delta: number) => {
      setLightbox((current) => {
        if (!current) return current
        const paths = current.event.mediaPaths
        const index = paths.indexOf(current.path)
        const next = (index + delta + paths.length) % paths.length
        return { event: current.event, path: paths[next] }
      })
    },
    [setLightbox]
  )

  const selectedPhoto = lightbox ? photoByPath.get(lightbox.path) ?? null : null

  return (
    <div className="events-view">
      <div className="curate-top">
        <h1>Events</h1>
        {result && (
          <span className="muted">
            {clustering?.events.length ?? 0} events from {result.summary.analyzed} photos
            {clustering && clustering.unclustered.length > 0 && ` · ${clustering.unclustered.length} without a date`}
          </span>
        )}
      </div>

      <SpecialDatesManager state={specialDates} />

      {!result && (
        <p className="muted curate-intro">
          Analyze a folder in Curate first — its photos are then grouped into events here by date and location, and
          labeled with your special dates.
        </p>
      )}

      {clustering && clustering.events.length === 0 && result && (
        <p className="muted curate-intro">No dated photos in the last scan, so there are no events to show.</p>
      )}

      {clustering &&
        clustering.events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            thumbnailByPath={thumbnailByPath}
            onOpen={(path) => setLightbox({ event, path })}
          />
        ))}

      {clustering && clustering.unclustered.length > 0 && (
        <section className="event-card">
          <header className="event-card-header">
            <h2>No date</h2>
            <span className="muted">{clustering.unclustered.length} photos without a capture time</span>
          </header>
        </section>
      )}

      {lightbox && selectedPhoto && (
        <Lightbox
          photo={selectedPhoto}
          fallbackThumbnailUrl={thumbnailByPath.get(selectedPhoto.media.path)?.thumbnailUrl ?? null}
          effectiveVerdict={session.effectiveVerdict(selectedPhoto.media.path)}
          hasOverride={session.hasOverride(selectedPhoto.media.path)}
          onClose={() => setLightbox(null)}
          onPrev={() => moveLightbox(-1)}
          onNext={() => moveLightbox(1)}
          onSetVerdict={(verdict: Verdict) => session.setVerdict(selectedPhoto.media.path, verdict)}
          onClearOverride={() => session.clearOverride(selectedPhoto.media.path)}
        />
      )}
    </div>
  )
}

interface EventCardProps {
  event: EventGroup
  thumbnailByPath: Map<string, { thumbnailUrl: string | null } | undefined> | Map<string, { thumbnailUrl: string | null }>
  onOpen: (path: string) => void
}

function EventCard({ event, thumbnailByPath, onOpen }: EventCardProps): JSX.Element {
  return (
    <section className="event-card">
      <header className="event-card-header">
        <h2>{formatRange(event.startMs, event.endMs)}</h2>
        {event.labels.map((label) => (
          <span key={label} className="event-label">
            {label}
          </span>
        ))}
        <span className="muted">
          {event.mediaPaths.length} photo{event.mediaPaths.length === 1 ? '' : 's'} ·{' '}
          {event.centroid ? `near ${event.centroid.lat.toFixed(2)}, ${event.centroid.lon.toFixed(2)}` : 'no location'}
        </span>
      </header>
      <div className="event-strip">
        {event.mediaPaths.map((path) => {
          const url = thumbnailByPath.get(path)?.thumbnailUrl ?? null
          return (
            <button key={path} className="event-thumb" onClick={() => onOpen(path)} title={path}>
              {url ? <img src={url} alt="" loading="lazy" /> : <span className="photo-tile-noimage">?</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function formatRange(startMs: number, endMs: number): string {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay ? dateFormat.format(start) : `${dateFormat.format(start)} – ${dateFormat.format(end)}`
}
