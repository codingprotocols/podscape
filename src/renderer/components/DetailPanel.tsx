import React from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store'
import PodDetail from './PodDetail'
import DeploymentDetail from './DeploymentDetail'
import StatefulSetDetail from './StatefulSetDetail'
import JobDetail from './JobDetail'
import CronJobDetail from './CronJobDetail'
import IngressDetail from './IngressDetail'
import ServiceDetail from './ServiceDetail'
import NodeDetail from './NodeDetail'
import ConfigMapDetail from './ConfigMapDetail'
import SecretDetail from './SecretDetail'
import DaemonSetDetail from './DaemonSetDetail'
import HPADetail from './HPADetail'
import PVCDetail from './PVCDetail'
import RoleBindingDetail from './RoleBindingDetail'
import RoleDetail from './RoleDetail'
import ReplicaSetDetail from './ReplicaSetDetail'
import NamespaceDetail from './NamespaceDetail'
import CRDDetail from './CRDDetail'
import PDBDetail from './PDBDetail'
import IngressClassDetail from './IngressClassDetail'
import NetworkPolicyDetail from './NetworkPolicyDetail'
import EndpointsDetail from './EndpointsDetail'
import StorageClassDetail from './StorageClassDetail'
import PVDetail from './PVDetail'
import SADetail from './SADetail'
import { 
  AnyKubeResource, KubePod, KubeDeployment,  KubeDaemonSet, KubeStatefulSet, KubeReplicaSet, KubeJob, KubeCronJob,
  KubeService, KubeIngress, KubeConfigMap, KubeSecret, KubePVC, KubePV,
  KubeServiceAccount, KubeNode, KubeNamespace, KubeCRD, KubeIngressClass,
  KubeNetworkPolicy, KubeEndpoints, KubeStorageClass, KubeHPA, KubePDB
} from '../types'

interface DetailPanelProps {
  resource: AnyKubeResource
  section: string
}

export default function DetailPanel({ resource, section }: DetailPanelProps): JSX.Element | null {
  const selectResource = useAppStore(s => s.selectResource)
  if (!resource) return null

  let content: JSX.Element | null
  switch (section) {
    case 'pods': content = <PodDetail key={resource.metadata.uid} pod={resource as KubePod} />; break
    case 'deployments': content = <DeploymentDetail deployment={resource as KubeDeployment} />; break
    case 'daemonsets': content = <DaemonSetDetail daemonSet={resource as KubeDaemonSet} />; break
    case 'statefulsets': content = <StatefulSetDetail statefulSet={resource as KubeStatefulSet} />; break
    case 'replicasets': content = <ReplicaSetDetail replicaSet={resource as KubeReplicaSet} />; break
    case 'jobs': content = <JobDetail job={resource as KubeJob} />; break
    case 'cronjobs': content = <CronJobDetail cronJob={resource as KubeCronJob} />; break
    case 'services': content = <ServiceDetail service={resource as KubeService} />; break
    case 'ingresses': content = <IngressDetail ingress={resource as KubeIngress} />; break
    case 'configmaps': content = <ConfigMapDetail configMap={resource as KubeConfigMap} />; break
    case 'secrets': content = <SecretDetail secret={resource as KubeSecret} />; break
    case 'pvcs': content = <PVCDetail pvc={resource as KubePVC} />; break
    case 'pvs': content = <PVDetail pv={resource as KubePV} />; break
    case 'serviceaccounts': content = <SADetail sa={resource as KubeServiceAccount} />; break
    case 'namespaces': content = <NamespaceDetail namespace={resource as KubeNamespace} />; break
    case 'nodes': content = <NodeDetail node={resource as KubeNode} />; break
    case 'crds': content = <CRDDetail crd={resource as KubeCRD} />; break
    case 'hpas': content = <HPADetail hpa={resource as KubeHPA} />; break
    case 'pdbs': content = <PDBDetail pdb={resource as KubePDB} />; break
    case 'ingressclasses': content = <IngressClassDetail ic={resource as KubeIngressClass} />; break
    case 'networkpolicies': content = <NetworkPolicyDetail np={resource as KubeNetworkPolicy} />; break
    case 'endpoints': content = <EndpointsDetail ep={resource as KubeEndpoints} />; break
    case 'storageclasses': content = <StorageClassDetail sc={resource as KubeStorageClass} />; break
    case 'roles': content = <RoleDetail role={resource as any} />; break
    case 'clusterroles': content = <RoleDetail role={resource as any} clusterScoped />; break
    case 'rolebindings': content = <RoleBindingDetail binding={resource as any} />; break
    case 'clusterrolebindings': content = <RoleBindingDetail binding={resource as any} />; break
    default: return null
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden border-l border-slate-200 dark:border-white/5">
      <div className="flex items-center justify-end px-3 py-1.5 shrink-0 border-b border-slate-200 dark:border-white/5 bg-white/5">
        <button
          onClick={() => selectResource(null)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Close (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {content}
      </div>
    </div>
  )
}
