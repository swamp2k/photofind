import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LiteGeoBounds, LiteMediaRecord } from './types'
import { hasLocation } from './filters'

interface GeoMapProps {
  items: LiteMediaRecord[]
  filterToViewport: boolean
  onBoundsChange(bounds: LiteGeoBounds | null): void
  onSelect(itemId: string): void
}

const SOURCE_ID = 'photofind-photos'
const CLUSTERS_LAYER = 'photofind-clusters'
const CLUSTER_COUNT_LAYER = 'photofind-cluster-count'
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
  const geoJson = useMemo(() => toFeatureCollection(items), [items])

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

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geoJson,
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
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12
        },
        paint: { 'text-color': '#ffffff' }
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
        const feature = event.features?.[0]
        const id = feature?.properties?.id
        if (typeof id === 'string') onSelect(id)
      })

      map.on('mouseenter', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', POINTS_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', POINTS_LAYER, () => { map.getCanvas().style.cursor = '' })
      initializedRef.current = true
      fitMapToItems(map, items)
      emitBounds(map, filterToViewport, onBoundsChange)
    })

    map.on('moveend', () => emitBounds(map, filterToViewport, onBoundsChange))

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
  if (!enabled) {
    callback(null)
    return
  }
  const bounds = map.getBounds()
  callback({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })
}

function toFeatureCollection(items: LiteMediaRecord[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: items.filter(hasLocation).map((item) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.longitude!, item.latitude!] },
      properties: { id: item.id }
    }))
  }
}
