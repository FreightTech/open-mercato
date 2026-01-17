/**
 * FMS Booking Module - Detail View
 * Booking detail page with sections for details, legs, cargo/containers
 */

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Edit, Trash2 } from 'lucide-react'

export default function BookingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string

  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/fms_booking/bookings/${bookingId}`)

        if (!response.ok) {
          throw new Error('Failed to fetch booking')
        }

        const data = await response.json()
        setBooking(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (bookingId) {
      fetchBooking()
    }
  }, [bookingId])

  const handleBack = () => {
    router.push('/backend/fms-bookings')
  }

  const handleEdit = () => {
    // Navigate to edit page (future implementation)
    router.push(`/backend/fms-bookings/${bookingId}/edit`)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this booking?')) {
      return
    }

    try {
      const response = await fetch(`/api/fms_booking/bookings/${bookingId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete booking')
      }

      router.push('/backend/fms-bookings')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete booking')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">Loading booking...</div>
        </div>
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error: {error || 'Booking not found'}</div>
        </div>
      </div>
    )
  }

  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    plan_route: { label: 'Planning', color: 'bg-blue-100 text-blue-800' },
    add_cargo: { label: 'Adding Cargo', color: 'bg-yellow-100 text-yellow-800' },
    validated: { label: 'Validated', color: 'bg-green-100 text-green-800' },
    confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
    in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-800' },
    delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800' },
    completed: { label: 'Completed', color: 'bg-green-200 text-green-900' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  }

  const status = statusMap[booking.current_step] || {
    label: booking.current_step,
    color: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button onClick={handleBack} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{booking.booking_number}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
                {status.label}
              </span>
              <span className="text-sm text-gray-600">
                {booking.cargo_type?.toUpperCase()} · {booking.shipment_type}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleEdit} variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button onClick={handleDelete} variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Client</div>
                <div className="mt-1">{booking.client_name || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Booking Date</div>
                <div className="mt-1">
                  {booking.booking_date ? new Date(booking.booking_date).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Incoterm</div>
                <div className="mt-1">{booking.incoterm || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Container Count</div>
                <div className="mt-1">{booking.container_count || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Locations</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Origin</div>
                <div className="mt-1">{booking.origin_address || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Destination</div>
                <div className="mt-1">{booking.destination_address || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Cargo Details */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Cargo Details</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-500">Commodity Description</div>
                <div className="mt-1">{booking.commodity_description || 'N/A'}</div>
              </div>
              {booking.hs_code && (
                <div>
                  <div className="text-sm font-medium text-gray-500">HS Code</div>
                  <div className="mt-1">{booking.hs_code}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-500">Total Gross Weight</div>
                  <div className="mt-1">
                    {booking.total_gross_weight
                      ? `${booking.total_gross_weight} ${booking.weight_unit || 'kg'}`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Total Volume</div>
                  <div className="mt-1">
                    {booking.total_volume
                      ? `${booking.total_volume} ${booking.volume_unit || 'cbm'}`
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Route Legs */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Route Legs</h2>
            {booking.legs && booking.legs.length > 0 ? (
              <div className="space-y-2">
                {booking.legs.map((leg: any, index: number) => (
                  <div key={leg.id} className="border rounded p-3">
                    <div className="font-medium">
                      Leg {leg.leg_sequence}: {leg.transport_mode}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {leg.origin_address || 'N/A'} → {leg.destination_address || 'N/A'}
                    </div>
                    {leg.carrier_name && (
                      <div className="text-sm text-gray-600 mt-1">Carrier: {leg.carrier_name}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No route legs added yet</div>
            )}
          </div>

          {/* Containers/Cargo */}
          {booking.cargo_type === 'fcl' && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Containers</h2>
              {booking.containers && booking.containers.length > 0 ? (
                <div className="space-y-2">
                  {booking.containers.map((container: any) => (
                    <div key={container.id} className="border rounded p-3">
                      <div className="font-medium">{container.container_type}</div>
                      {container.container_number && (
                        <div className="text-sm text-gray-600">
                          Number: {container.container_number}
                        </div>
                      )}
                      {container.gross_weight && (
                        <div className="text-sm text-gray-600">
                          Weight: {container.gross_weight} {container.weight_unit || 'kg'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No containers added yet</div>
              )}
            </div>
          )}

          {booking.cargo_type === 'lcl' && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Cargo Items</h2>
              {booking.cargo && booking.cargo.length > 0 ? (
                <div className="space-y-2">
                  {booking.cargo.map((item: any) => (
                    <div key={item.id} className="border rounded p-3">
                      <div className="font-medium">{item.commodity_description}</div>
                      <div className="text-sm text-gray-600">
                        {item.package_count} {item.package_type}
                      </div>
                      {item.gross_weight && (
                        <div className="text-sm text-gray-600">
                          Weight: {item.gross_weight} {item.weight_unit || 'kg'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No cargo items added yet</div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* References */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">References</h2>
            <div className="space-y-3">
              {booking.client_reference && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Client Reference</div>
                  <div className="mt-1 font-mono text-sm">{booking.client_reference}</div>
                </div>
              )}
              {booking.internal_reference && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Internal Reference</div>
                  <div className="mt-1 font-mono text-sm">{booking.internal_reference}</div>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Dates</h2>
            <div className="space-y-3">
              {booking.requested_pickup_date && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Requested Pickup</div>
                  <div className="mt-1">
                    {new Date(booking.requested_pickup_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              {booking.requested_delivery_date && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Requested Delivery</div>
                  <div className="mt-1">
                    {new Date(booking.requested_delivery_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-500">Created</div>
                <div className="mt-1">{new Date(booking.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Last Updated</div>
                <div className="mt-1">{new Date(booking.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Financial */}
          {booking.estimated_cost && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Financial</h2>
              <div>
                <div className="text-sm font-medium text-gray-500">Estimated Cost</div>
                <div className="mt-1 text-lg font-semibold">
                  {booking.currency_code} {booking.estimated_cost}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
