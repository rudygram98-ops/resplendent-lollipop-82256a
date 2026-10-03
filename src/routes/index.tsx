import { createFileRoute } from '@tanstack/react-router'
import { Buzzly } from '@/components/Buzzly'

export const Route = createFileRoute('/')({
  component: Buzzly,
})
