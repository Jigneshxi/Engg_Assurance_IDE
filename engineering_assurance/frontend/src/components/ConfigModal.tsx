import React from 'react';
import { ConnectionConfig } from '../types';

interface ConfigModalProps {
  platformId: string;
  config: ConnectionConfig;
  setConfig: (c: ConnectionConfig) => void;
  onSave: () => void;
  onClose: () => void;
  status: { type: string, message: string };
}

const ConfigModal: React.FC<ConfigModalProps> = ({ platformId, config, setConfig, onSave, onClose, status }) => {
  const isMock = (config.url === 'mock://vvnt' || config.token === 'mock');
  const pid = (platformId || '').toLowerCase();
  const needsEmail = new Set(['jira', 'confluence', 'testrail', 'servicenow']).has(pid);
  const isXray = pid === 'xray';
  const isZephyrSquad = pid === 'zephyr';
  const needsConsent = new Set(['jira', 'ado', 'github', 'gitlab', 'bitbucket', 'confluence']).has(pid);
  const consentGranted = config.consent?.granted || false;
  
  const toggleConsent = () => setConfig({
    ...config,
    consent: consentGranted ? undefined : { granted: true, timestamp: new Date().toISOString(), scopes: ['Read all projects/repos', 'Read/Write Issues/PRs'] }
  });

  const urlLabel =
    pid === 'swagger' ? 'Spec URL or API Base URL' :
    (pid === 'notion' || pid === 'googledrive' || pid === 'onedrive' || pid === 'sharepoint' || pid === 'slack')
      ? 'Instance / Tenant (optional)'
      : 'Instance URL';

  const urlPlaceholder =
    pid === 'jira' ? 'https://your-org.atlassian.net' :
    pid === 'confluence' ? 'https://your-org.atlassian.net/wiki' :
    pid === 'ado' ? 'https://dev.azure.com/your-org' :
    pid === 'github' ? 'https://github.com (or https://ghe.company.com)' :
    pid === 'gitlab' ? 'https://gitlab.com (or https://gitlab.company.com)' :
    pid === 'bitbucket' ? 'https://bitbucket.org' :
    pid === 'servicenow' ? 'https://your-instance.service-now.com' :
    pid === 'testrail' ? 'https://testrail.company.com' :
    pid === 'qtest' ? 'https://qtest.company.com' :
    pid === 'xray' ? 'https://xray.cloud.getxray.app' :
    pid === 'zephyr' ? 'Enter your 71-character Atlassian Account ID' :
    pid === 'alm' ? 'https://alm.company.com/qcbin' :
    pid === 'rally' ? 'https://rally1.rallydev.com' :
    pid === 'swagger' ? 'https://petstore3.swagger.io/openapi.json (or base URL)' :
    'https://...';

  const tokenLabel =
    pid === 'ado' ? 'PAT (Personal Access Token)' :
    pid === 'gitlab' ? 'Access Token (PAT)' :
    pid === 'slack' ? 'Bot/User Token' :
    pid === 'xray' ? 'Client Secret' :
    pid === 'zephyr' ? 'Secret Key' :
    'Access Token';

  const platformHelp =
    pid === 'jira' ? 'Enter your Jira site URL (what you open in the browser). Requires email + API token.' :
    pid === 'ado' ? 'Enter your Azure DevOps org URL (browser URL). Requires PAT.' :
    pid === 'github' ? 'Enter https://github.com or your GitHub Enterprise Server URL. Requires a token.' :
    pid === 'gitlab' ? 'Enter https://gitlab.com or your self-hosted GitLab URL. Requires a PAT.' :
    pid === 'bitbucket' ? 'Enter https://bitbucket.org (cloud). Requires an OAuth token.' :
    pid === 'confluence' ? 'Enter your Confluence URL (usually ends with /wiki). Requires email + API token.' :
    pid === 'notion' ? 'Requires a Notion integration token. URL can be left as-is.' :
    pid === 'googledrive' ? 'Requires a Google OAuth access token. URL can be left as-is.' :
    pid === 'onedrive' ? 'Requires a Microsoft Graph OAuth access token. URL can be left as-is.' :
    pid === 'sharepoint' ? 'Requires a Microsoft Graph OAuth access token. URL can be left as-is.' :
    pid === 'servicenow' ? 'Enter your ServiceNow instance URL. Requires username + password/token (or bearer token).' :
    pid === 'testrail' ? 'Enter your TestRail base URL. Requires username + API key.' :
    pid === 'qtest' ? 'Enter your qTest base URL. Requires bearer token.' :
    pid === 'xray' ? 'Xray Cloud: enter your Client ID + Client Secret from the Xray API Keys page (Jira → Xray → API Keys). The backend will authenticate and obtain a Bearer token automatically.' :
    pid === 'zephyr' ? 'Zephyr Squad Cloud: generate an Access Key and Secret Key via Zephyr UI. You also need your Atlassian Account ID.' :
    pid === 'alm' ? 'Enter your ALM/QC URL (usually ends with /qcbin). Requires username + password/token.' :
    pid === 'rally' ? 'Enter your Rally base URL. Requires ZSESSIONID or bearer token.' :
    pid === 'swagger' ? 'Enter a direct OpenAPI URL (best) or an API base URL. No token required.' :
    pid === 'slack' ? 'Requires a Slack bot token (xoxb-...). URL can be left as-is.' :
    'Enter the product instance URL and credentials.';

  return (
    <div className="modal-overlay animate-fadeIn">
      <div className="modal-content animate-slideIn">
        <div className="modal-header border-none" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h2 className="title-gradient">{platformId.toUpperCase()} Environment Vault</h2>
          <button className="modal-close-btn" onClick={onClose} title="Close">
             <i className="ti-close"></i>
          </button>
        </div>

        <div className="modal-body">
          {status.message && (
             <div className={`status-pill ${status.type}`} style={{ maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem', lineHeight: '1.4' }}>
                {status.type === 'testing' && <span className="spinner-mini"></span>}
                {status.message}
             </div>
          )}

          <div className="status-pill info" style={{ marginBottom: '14px' }}>
            <i className="ti-info-alt" style={{ marginRight: '8px' }} />
            Tip: Use <strong>Mock Mode</strong> by setting token to <strong>mock</strong> for offline demos. For live handshakes, enter your real instance URL + credentials.
          </div>
          <div className="status-pill info" style={{ marginBottom: '14px' }}>
            <i className="ti-help-alt" style={{ marginRight: '8px' }} />
            {platformHelp}
          </div>

          <div className="modal-action-row" style={{ marginBottom: '12px' }}>
            <button
              className="btn-secondary-link full-width"
              onClick={() => setConfig({ ...config, url: 'mock://vvnt', token: 'mock', email: config.email || 'user@enterprise.com' })}
              disabled={status.type === 'testing'}
              title="Populate mock connection data for offline demos"
            >
              <i className="ti-wand" /> Use Mock Mode Test Data
            </button>
          </div>

          {!isXray && !isZephyrSquad && (
            <div className="form-group">
              <label htmlFor="config-url">{urlLabel}</label>
              <input id="config-url" type="text" placeholder={urlPlaceholder} value={config.url} onChange={e => setConfig({...config, url: e.target.value})} />
            </div>
          )}
          {/* Zephyr Squad: dedicated Access Key + Secret Key + Account ID fields */}
          {isZephyrSquad ? (
            <>
              <div className="form-group">
                <label htmlFor="config-zephyr-access">Access Key</label>
                <input
                  id="config-zephyr-access"
                  type="text"
                  placeholder="amsh...xxxx"
                  value={config.email}
                  onChange={e => setConfig({...config, email: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label htmlFor="config-zephyr-secret">Secret Key</label>
                <div className="password-input-wrapper">
                  <input id="config-zephyr-secret" type="password" placeholder="Secret Key" value={config.token} onChange={e => setConfig({...config, token: e.target.value})} />
                  <i className="ti-lock"></i>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="config-zephyr-account">Atlassian Account ID</label>
                <input
                  id="config-zephyr-account"
                  type="text"
                  placeholder="e.g. 5b5d19..."
                  value={config.url}
                  onChange={e => setConfig({...config, url: e.target.value})}
                />
              </div>
            </>
          ) : isXray ? (
            <>
              <div className="form-group">
                <label htmlFor="config-xray-client-id">Client ID</label>
                <input
                  id="config-xray-client-id"
                  type="text"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={config.email}
                  onChange={e => setConfig({...config, email: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label htmlFor="config-xray-client-secret">Client Secret</label>
                <div className="password-input-wrapper">
                  <input id="config-xray-client-secret" type="password" placeholder="Client Secret" value={config.token} onChange={e => setConfig({...config, token: e.target.value})} />
                  <i className="ti-lock"></i>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="config-xray-project">Jira Project Key</label>
                <input
                  id="config-xray-project"
                  type="text"
                  placeholder="e.g. QA"
                  value={config.url}
                  onChange={e => setConfig({...config, url: e.target.value})}
                />
              </div>
            </>
          ) : (
            <>
              {needsEmail && (
                <div className="form-group">
                  <label htmlFor="config-email">Username / Email</label>
                  <input id="config-email" type="text" placeholder="user@enterprise.com" value={config.email} onChange={e => setConfig({...config, email: e.target.value})} />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="config-token">{tokenLabel}</label>
                <div className="password-input-wrapper">
                  <input id="config-token" type="password" placeholder="API Key / Token" value={config.token} onChange={e => setConfig({...config, token: e.target.value})} />
                  <i className="ti-lock"></i>
                </div>
              </div>
            </>
          )}
          
          {needsConsent && (
            <div className="form-group" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: 0, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={consentGranted} 
                  onChange={toggleConsent} 
                  style={{ marginTop: '4px', width: 'auto' }}
                />
                <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600, lineHeight: 1.4 }}>
                  I grant permission for the AI to securely access this {platformId.toUpperCase()} instance using the provided credentials, including reading projects/issues and adding authorized comments on my behalf.
                </span>
              </label>
            </div>
          )}

          <div className="modal-action-row">
             <button className="btn-primary highlight full-width" onClick={onSave} disabled={status.type === 'testing' || (needsConsent && !consentGranted && !isMock)}>
                {status.type === 'testing'
                  ? 'Testing Connection...'
                  : (isMock ? 'Test Connection (Mock)' : 'Test Connection')}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
