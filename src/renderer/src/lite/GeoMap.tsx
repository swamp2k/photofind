import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { hasLocation } from './filters'
import type { LiteGeoBounds, LiteMediaRecord } from './types'

interface GeoMapProps {
  items: LiteMediaRecord[]
  filterToViewport: boolean
  onBoundsChange(bounds: LiteGeoBounds | null): void
  onSelect(itemId: string): void
}

const SOURCE_ID = 'photofind-photos'
const CLUSTERS_LAYER = 'photofind-clusters'
const POINTS_LAYER = 'photofind-points'

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
}

export function GeoMap({ items, filterToViewport, onBoundsChange, onSelect }: GeoMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const initializedRef = useRef(false)
  const viewportEnabledRef = useRef(filterToViewport)
  const boundsCallbackRef = useRef(onBoundsChange)
  const selectCallbackRef = useRef(onSelect)
  const latestItemsRef = useRef(items)
  const geoJson = useMemo(() => toFeatureCollection(items), [items])
  const geoJsonRef = useRef(geoJson)

  useEffect(() => {
    viewportEnabledRef.current = filterToViewport
    boundsCallbackRef.current = onBoundsChange
    selectCallbackRef.current = onSelect
    latestItemsRef.current = items
    geoJsonRef.current = geoJson
  }, [filterToViewport, onBoundsChange, onSelect, items, geoJson])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [10.5, 56.2],
      zoom: 5,
      attributionControl: true
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const emitCurrentBounds = (): void => {
      emitBounds(map, viewportEnabledRef.current, boundsCallbackRef.current)
    }

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geoJsonRef.current,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48
      })
      map.addLayer({
        id: CLUSTERS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4b8cff',
          'circle-radius': ['step', ['get', 'point_count'], 17, 25, 22, 100, 28],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#dbe9ff'
        }
      })
      map.addLayer({
        id: POINTS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ffcf70',
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#11151b'
        }
      })

      map.on('click', CLUSTERS_LAYER, (event) => {
        const feature = event.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const coordinates = feature.geometry.coordinates as [number, number]
        map.easeTo({ center: coordinates, zoom: Math.min(map.getZoom() + 2, 16) })
      })
      map.on('click', POINTS_LAYER, (event) => {
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') selectCallbackRef.current(id)
      })
      map.on('mouseenter', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', POINTS_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', POINTS_LAYER, () => { map.getCanvas().style.cursor = '' })

      initializedRef.current = true
      fitMapToItems(map, latestItemsRef.current)
      emitCurrentBounds()
    })

    map.on('moveend', emitCurrentBounds)
    return () => {
      initializedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !initializedRef.current) return
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(geoJson)
  }, [geoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !initializedRef.current) return
    emitBounds(map, filterToViewport, onBoundsChange)
  }, [filterToViewport, onBoundsChange])

  return <div className="geo-map" ref={containerRef} aria-label="Map of geotagged photos" />
}

export function fitMapToItems(map: MapLibreMap, items: LiteMediaRecord[]): void {
  const located = items.filter(hasLocation)
  if (located.length === 0) return
  if (located.length === 1) {
    map.easeTo({ center: [located[0].longitude!, located[0].latitude!], zoom: 11 })
    return
  }

  let west = 180
  let east = -180
  let south = 90
  let north = -90
  for (const item of located) {
    west = Math.min(west, item.longitude!)
    east = Math.max(east, item.longitude!)
    south = Math.min(south, item.latitude!)
    north = Math.max(north, item.latitude!)
  }
  const bounds: LngLatBoundsLike = [[west, south], [east, north]]
  map.fitBounds(bounds, { padding: 42, maxZoom: 12, duration: 0 })
}

function emitBounds(map: MapLibreMap, enabled: boolean, callback: (bounds: LiteGeoBounds | null) => void): void {
  if (!enabled) return callback(null)
  const bounds = map.getBounds()
  callback({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })
}

function toFeatureCollection(items: LiteMediaRecord[]) {
  return {
    type: 'FeatureCollection' as const,
    features: items.filter(hasLocation).map((item) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [item.longitude!, item.latitude!] },
      properties: { id: item.id }
    }))
  }
}
