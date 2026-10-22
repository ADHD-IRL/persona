import {useNavigate} from 'react-router-dom';
import {WorkflowButton} from '@/components/ui/WorkflowControls';
export default function ConvenePanelButton({variant='secondary',className=''}){const navigate=useNavigate();return <WorkflowButton variant={variant} className={className} onClick={()=>navigate('/panel-room')}>Open Panel Room</WorkflowButton>;}
