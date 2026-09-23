import {beforeEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),send:vi.fn()}));
vi.mock('../store',()=>({default:{get:h.get,set:h.set}}));vi.mock('electron',()=>({BrowserWindow:{getAllWindows:()=>[{webContents:{send:h.send}}]}}));
import {recordSyncSuccess} from '../sync-success';
beforeEach(()=>{vi.resetAllMocks();h.get.mockReturnValue('branch');});
it('records the completed operation time and branch, and notifies all views',()=>{recordSyncSuccess('المخزون');expect(h.set).toHaveBeenCalledWith('lastSuccessfulSync',expect.objectContaining({branchId:'branch',kind:'المخزون',at:expect.any(String)}));expect(h.send).toHaveBeenCalledWith('staff-sync-updated');});
it('does not attribute success to an unconfigured branch',()=>{h.get.mockReturnValue('');recordSyncSuccess('المبيعات');expect(h.set).not.toHaveBeenCalled();});
it('a closing renderer cannot turn completed synchronization into failure',()=>{h.send.mockImplementation(()=>{throw Error('closed')});expect(()=>recordSyncSuccess('المبيعات')).not.toThrow();});
