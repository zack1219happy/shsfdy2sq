export interface Comment {
  id: string
  page: string
  author: string
  content: string
  date: string
  parentId?: string
  status: 'pending' | 'approved' | 'rejected'
  userId?: string
  authorColor?: string
}

export interface CommentsData {
  [pageSlug: string]: Comment[]
}

export interface EditSuggestion {
  id: string
  page: string
  type: 'edit' | 'new'
  title: string
  content: string
  reason: string
  author: string
  date: string
  status: 'pending' | 'approved' | 'rejected'
}
