import { Suspense } from 'react';
import InterviewRoom from '../../component/InterviewRoom';

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">Loading...</div>}>
      <InterviewRoom />
    </Suspense>
  );
}
