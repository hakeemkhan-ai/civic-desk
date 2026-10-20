import { ReportDetail } from '../../../client/CivicDesk';

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportDetail id={id} />;
}
