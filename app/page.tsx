import DeskReveal from '@/components/DeskReveal';
import ScrollHint from '@/components/BeforeScrollContent';

export default function Home() {
  return (
    <main className="relative w-full">
      <DeskReveal />
      <ScrollHint />
    </main>
  );
}
