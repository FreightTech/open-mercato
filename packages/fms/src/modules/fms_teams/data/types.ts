export type TeamMember = {
  id: string | null
  teamId: string | null
  teamName: string | null
  userId: string
  userName: string
  userEmail: string
}

export type TeamMemberListResponse = {
  items: TeamMember[]
  total: number
  page: number
  totalPages: number
}

export type TeamListItem = {
  id: string
  name: string
  isActive: boolean
  memberCount: number
  createdAt: string
}

export type TeamListResponse = {
  items: TeamListItem[]
  total: number
  page: number
  totalPages: number
}

export type ContractorAssignment = {
  id: string
  contractorId: string
  contractorName: string
  createdAt: string
}

export type ContractorAssignmentListResponse = {
  items: ContractorAssignment[]
  total: number
  page: number
  totalPages: number
}
