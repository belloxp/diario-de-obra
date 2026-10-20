import { Building2, CloudRain, Image, KeyRound, NotebookPen, Tag, User } from 'lucide-react';

export function ActivityIcon({ action }: { action: string }) {
  const prefix = action.split('.')[0];
  const props = { size: 16 };
  switch (prefix) {
    case 'photo':
      return <Image {...props} />;
    case 'diary':
      return <NotebookPen {...props} />;
    case 'rain':
      return <CloudRain {...props} />;
    case 'project':
      return <Building2 {...props} />;
    case 'category':
      return <Tag {...props} />;
    case 'auth':
      return <KeyRound {...props} />;
    default:
      return <User {...props} />;
  }
}
