package topology

import (
	"fmt"
	"github.com/podscape/go-core/internal/store"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NodeKind string

const (
	KindIngress  NodeKind = "ingress"
	KindService  NodeKind = "service"
	KindPod      NodeKind = "pod"
	KindPolicy   NodeKind = "policy"
	KindPVC      NodeKind = "pvc"
	KindNode     NodeKind = "node"
	KindWorkload NodeKind = "workload"
)

type TopologyNode struct {
	ID           string   `json:"id"`
	Kind         NodeKind `json:"kind"`
	Name         string   `json:"name"`
	Namespace    string   `json:"namespace"`
	Phase        string   `json:"phase,omitempty"`
	ServiceType  string   `json:"serviceType,omitempty"`
	Ports        []string `json:"ports,omitempty"`
	WorkloadKind string   `json:"workloadKind,omitempty"`
}

type EdgeKind string

const (
	EdgeIngSvc             EdgeKind = "ing-svc"
	EdgeSvcPod             EdgeKind = "svc-pod"
	EdgePolicyPod          EdgeKind = "policy-pod"
	EdgePolIngress         EdgeKind = "pol-ingress"
	EdgePolEgress          EdgeKind = "pol-egress"
	EdgePodPVC             EdgeKind = "pod-pvc"
	EdgePodNode            EdgeKind = "pod-node"
	EdgeControllerPod      EdgeKind = "controller-pod"
	EdgeControllerWorkload EdgeKind = "controller-workload"
)

type TopologyEdge struct {
	ID     string   `json:"id"`
	Source string   `json:"source"`
	Target string   `json:"target"`
	Kind   EdgeKind `json:"kind"`
	Label  string   `json:"label,omitempty"`
}

type Topology struct {
	Nodes      []TopologyNode `json:"nodes"`
	Edges      []TopologyEdge `json:"edges"`
	Namespaces []string       `json:"namespaces"`
}

func BuildTopology(nsFilter string) *Topology {
	topo := &Topology{
		Nodes:      []TopologyNode{},
		Edges:      []TopologyEdge{},
		Namespaces: []string{},
	}

	store.Store.RLock()
	defer store.Store.RUnlock()

	edgeMap := make(map[string]bool)
	nsMap := make(map[string]bool)

	addEdge := func(src, tgt string, kind EdgeKind, label string) {
		id := fmt.Sprintf("%s--%s--%s", src, tgt, kind)
		if !edgeMap[id] {
			edgeMap[id] = true
			topo.Edges = append(topo.Edges, TopologyEdge{
				ID:     id,
				Source: src,
				Target: tgt,
				Kind:   kind,
				Label:  label,
			})
		}
	}

	// 1. Process Nodes (Cluster Level)
	for _, nObj := range store.Store.Nodes {
		node := nObj.(*corev1.Node)
		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:   fmt.Sprintf("node:%s", node.Name),
			Kind: KindNode,
			Name: node.Name,
		})
	}

	// 2. Process Ingresses
	for _, iObj := range store.Store.Ingresses {
		ing := iObj.(*networkingv1.Ingress)
		if nsFilter != "" && ing.Namespace != nsFilter {
			continue
		}
		nsMap[ing.Namespace] = true
		ingID := fmt.Sprintf("ing:%s:%s", ing.Namespace, ing.Name)
		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:        ingID,
			Kind:      KindIngress,
			Name:      ing.Name,
			Namespace: ing.Namespace,
		})

		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service != nil {
					svcID := fmt.Sprintf("svc:%s:%s", ing.Namespace, path.Backend.Service.Name)
					label := ""
					if path.Backend.Service.Port.Number > 0 {
						label = fmt.Sprintf(":%d", path.Backend.Service.Port.Number)
					} else if path.Backend.Service.Port.Name != "" {
						label = ":" + path.Backend.Service.Port.Name
					}
					addEdge(ingID, svcID, EdgeIngSvc, label)
				}
			}
		}
	}

	// 3. Process Services
	for _, sObj := range store.Store.Services {
		svc := sObj.(*corev1.Service)
		if nsFilter != "" && svc.Namespace != nsFilter {
			continue
		}
		nsMap[svc.Namespace] = true
		svcID := fmt.Sprintf("svc:%s:%s", svc.Namespace, svc.Name)

		ports := []string{}
		for _, p := range svc.Spec.Ports {
			ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}

		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:          svcID,
			Kind:        KindService,
			Name:        svc.Name,
			Namespace:   svc.Namespace,
			ServiceType: string(svc.Spec.Type),
			Ports:       ports,
		})
	}

	// 4. Process Pods
	for _, pObj := range store.Store.Pods {
		pod := pObj.(*corev1.Pod)
		if nsFilter != "" && pod.Namespace != nsFilter {
			continue
		}
		nsMap[pod.Namespace] = true
		podID := fmt.Sprintf("pod:%s", pod.UID)

		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:        podID,
			Kind:      KindPod,
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Phase:     string(pod.Status.Phase),
		})

		// Pod -> Node
		if pod.Spec.NodeName != "" {
			nodeID := fmt.Sprintf("node:%s", pod.Spec.NodeName)
			addEdge(podID, nodeID, EdgePodNode, "")
		}

		// Pod -> PVC
		for _, vol := range pod.Spec.Volumes {
			if vol.PersistentVolumeClaim != nil {
				pvcID := fmt.Sprintf("pvc:%s:%s", pod.Namespace, vol.PersistentVolumeClaim.ClaimName)
				addEdge(podID, pvcID, EdgePodPVC, "")
			}
		}

		// Owner Relationships (Controllers)
		for _, owner := range pod.OwnerReferences {
			ownerID := fmt.Sprintf("workload:%s:%s:%s", pod.Namespace, owner.Kind, owner.Name)
			addEdge(ownerID, podID, EdgeControllerPod, "")
		}

		// Service -> Pod matching
		for _, sObj := range store.Store.Services {
			svc := sObj.(*corev1.Service)
			if svc.Namespace != pod.Namespace {
				continue
			}
			if svc.Spec.Selector == nil {
				continue
			}
			match := true
			for k, v := range svc.Spec.Selector {
				if pod.Labels[k] != v {
					match = false
					break
				}
			}
			if match {
				svcID := fmt.Sprintf("svc:%s:%s", svc.Namespace, svc.Name)
				addEdge(svcID, podID, EdgeSvcPod, "")
			}
		}
	}

	// 5. Process Workloads (Deployments, ReplicaSets, etc.)
	processWorkload := func(kind, name, namespace string, owners []metav1.OwnerReference) {
		if nsFilter != "" && namespace != nsFilter {
			return
		}
		nsMap[namespace] = true
		wID := fmt.Sprintf("workload:%s:%s:%s", namespace, kind, name)
		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:           wID,
			Kind:         KindWorkload,
			WorkloadKind: kind,
			Name:         name,
			Namespace:    namespace,
		})
		for _, owner := range owners {
			ownerID := fmt.Sprintf("workload:%s:%s:%s", namespace, owner.Kind, owner.Name)
			addEdge(ownerID, wID, EdgeControllerWorkload, "")
		}
	}

	for _, dObj := range store.Store.Deployments {
		d := dObj.(*appsv1.Deployment)
		processWorkload("Deployment", d.Name, d.Namespace, d.OwnerReferences)
	}
	for _, rsObj := range store.Store.ReplicaSets {
		rs := rsObj.(*appsv1.ReplicaSet)
		processWorkload("ReplicaSet", rs.Name, rs.Namespace, rs.OwnerReferences)
	}
	for _, dsObj := range store.Store.DaemonSets {
		ds := dsObj.(*appsv1.DaemonSet)
		processWorkload("DaemonSet", ds.Name, ds.Namespace, ds.OwnerReferences)
	}
	for _, stsObj := range store.Store.StatefulSets {
		sts := stsObj.(*appsv1.StatefulSet)
		processWorkload("StatefulSet", sts.Name, sts.Namespace, sts.OwnerReferences)
	}
	for _, jObj := range store.Store.Jobs {
		j := jObj.(*batchv1.Job)
		processWorkload("Job", j.Name, j.Namespace, j.OwnerReferences)
	}
	for _, cjObj := range store.Store.CronJobs {
		cj := cjObj.(*batchv1.CronJob)
		processWorkload("CronJob", cj.Name, cj.Namespace, cj.OwnerReferences)
	}

	// 6. Process PVCs
	for _, pvcObj := range store.Store.PVCs {
		pvc := pvcObj.(*corev1.PersistentVolumeClaim)
		if nsFilter != "" && pvc.Namespace != nsFilter {
			continue
		}
		nsMap[pvc.Namespace] = true
		pvcID := fmt.Sprintf("pvc:%s:%s", pvc.Namespace, pvc.Name)
		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:        pvcID,
			Kind:      KindPVC,
			Name:      pvc.Name,
			Namespace: pvc.Namespace,
			Phase:     string(pvc.Status.Phase),
		})
	}

	// 7. Process Network Policies
	for _, polObj := range store.Store.NetworkPolicies {
		pol := polObj.(*networkingv1.NetworkPolicy)
		if nsFilter != "" && pol.Namespace != nsFilter {
			continue
		}
		nsMap[pol.Namespace] = true
		polID := fmt.Sprintf("pol:%s:%s", pol.Namespace, pol.Name)
		topo.Nodes = append(topo.Nodes, TopologyNode{
			ID:        polID,
			Kind:      KindPolicy,
			Name:      pol.Name,
			Namespace: pol.Namespace,
		})

		// Policy -> Pods (Target)
		for _, pObj := range store.Store.Pods {
			pod := pObj.(*corev1.Pod)
			if pod.Namespace != pol.Namespace {
				continue
			}
			match := true
			for k, v := range pol.Spec.PodSelector.MatchLabels {
				if pod.Labels[k] != v {
					match = false
					break
				}
			}
			if match {
				addEdge(polID, fmt.Sprintf("pod:%s", pod.UID), EdgePolicyPod, "")
			}
		}
	}

	for ns := range nsMap {
		topo.Namespaces = append(topo.Namespaces, ns)
	}

	return topo
}
