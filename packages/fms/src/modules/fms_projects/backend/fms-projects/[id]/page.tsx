/**
 * FMS Projects Module - Detail View
 * Project detail page with sections for details, legs, cargo/containers, documents, and costs
 */

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ArrowLeft, Edit, Trash2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { DocumentUploadSection } from '../../../components/DocumentUploadSection'
import { InvoiceCostsSection } from '../../../components/InvoiceCostsSection'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const projectId = params.id as string

  const { data: project, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['fms_project', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiCall<any>(`/api/fms_projects/projects/${projectId}`)
      if (!response.ok) throw new Error('Failed to load project')
      return response.result
    },
    enabled: !!projectId,
  })

  const error = queryError instanceof Error ? queryError.message : null

  const handleBack = () => {
    router.push('/backend/fms-projects')
  }

  const handleEdit = () => {
    // Navigate to edit page (future implementation)
    router.push(`/backend/fms-projects/${projectId}/edit`)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project?')) {
      return
    }

    try {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete project')
      }

      flash('Project deleted', 'success')
      router.push('/backend/fms-projects')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to delete project', 'error')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Spinner className="h-8 w-8" />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error: {error || 'Project not found'}</div>
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

  const status = statusMap[project.current_step] || {
    label: project.current_step,
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
            <h1 className="text-2xl font-bold">{project.project_number}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
                {status.label}
              </span>
              <span className="text-sm text-gray-600">
                {project.cargo_type?.toUpperCase()} · {project.shipment_type}
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
                <div className="mt-1">{project.client_name || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Project Date</div>
                <div className="mt-1">
                  {project.project_date ? new Date(project.project_date).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Incoterm</div>
                <div className="mt-1">{project.incoterm || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Container Count</div>
                <div className="mt-1">{project.container_count || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Locations</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Origin</div>
                <div className="mt-1">{project.origin_address || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Destination</div>
                <div className="mt-1">{project.destination_address || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Cargo Details */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Cargo Details</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-500">Commodity Description</div>
                <div className="mt-1">{project.commodity_description || 'N/A'}</div>
              </div>
              {project.hs_code && (
                <div>
                  <div className="text-sm font-medium text-gray-500">HS Code</div>
                  <div className="mt-1">{project.hs_code}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-500">Total Gross Weight</div>
                  <div className="mt-1">
                    {project.total_gross_weight
                      ? `${project.total_gross_weight} ${project.weight_unit || 'kg'}`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Total Volume</div>
                  <div className="mt-1">
                    {project.total_volume
                      ? `${project.total_volume} ${project.volume_unit || 'cbm'}`
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Route Legs */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Route Legs</h2>
            {project.legs && project.legs.length > 0 ? (
              <div className="space-y-2">
                {project.legs.map((leg: any, index: number) => (
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
          {project.cargo_type === 'fcl' && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Containers</h2>
              {project.containers && project.containers.length > 0 ? (
                <div className="space-y-2">
                  {project.containers.map((container: any) => (
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

          {project.cargo_type === 'lcl' && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Cargo Items</h2>
              {project.cargo && project.cargo.length > 0 ? (
                <div className="space-y-2">
                  {project.cargo.map((item: any) => (
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

          {/* Documents Section */}
          <DocumentUploadSection projectId={projectId} />

          {/* Costs & Invoices Section */}
          <InvoiceCostsSection
            projectId={projectId}
            estimatedCost={project.estimated_cost}
            currencyCode={project.currency_code || 'PLN'}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* References */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">References</h2>
            <div className="space-y-3">
              {project.client_reference && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Client Reference</div>
                  <div className="mt-1 font-mono text-sm">{project.client_reference}</div>
                </div>
              )}
              {project.internal_reference && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Internal Reference</div>
                  <div className="mt-1 font-mono text-sm">{project.internal_reference}</div>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Dates</h2>
            <div className="space-y-3">
              {project.requested_pickup_date && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Requested Pickup</div>
                  <div className="mt-1">
                    {new Date(project.requested_pickup_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              {project.requested_delivery_date && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Requested Delivery</div>
                  <div className="mt-1">
                    {new Date(project.requested_delivery_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-500">Created</div>
                <div className="mt-1">{new Date(project.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Last Updated</div>
                <div className="mt-1">{new Date(project.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Financial */}
          {project.estimated_cost && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Financial</h2>
              <div>
                <div className="text-sm font-medium text-gray-500">Estimated Cost</div>
                <div className="mt-1 text-lg font-semibold">
                  {project.currency_code} {project.estimated_cost}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
