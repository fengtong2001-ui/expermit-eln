import { Link } from 'react-router'
import { Compass } from 'lucide-react'
import { EmptyState, Button } from '@/components/ui'

export function NotFound() {
  return (
    <EmptyState
      icon={<Compass />}
      title="这个页面不存在"
      action={
        <Link to="/">
          <Button>回到今天</Button>
        </Link>
      }
    />
  )
}
