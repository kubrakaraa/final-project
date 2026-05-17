#  Kubernetes Final Projesi — Not Uygulaması

> Node.js web uygulamasının Docker ile containerize edilmesi ve Google Kubernetes Engine (GKE) üzerinde production-ready biçimde deploy edilmesi.

---

##  İçindekiler

1. [Proje Özeti](#proje-özeti)
2. [Uygulama Mimarisi](#uygulama-mimarisi)
3. [Kubernetes Mimarisi](#kubernetes-mimarisi)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
6. [Kubernetes Komutları](#kubernetes-komutları)
7. [Rolling Update ve Rollback](#rolling-update-ve-rollback)
8. [Scaling](#scaling)
9. [Bileşenler Açıklaması](#bileşenler-açıklaması)

---

## Proje Özeti

Bu projede basit bir **not alma web uygulaması** sıfırdan geliştirilmiş, Docker imajı oluşturulmuş ve Google Kubernetes Engine üzerinde çalıştırılmıştır.

| Bileşen | Teknoloji |
|---------|-----------|
| Uygulama | Node.js + Express |
| Container | Docker (multi-stage build) |
| Orchestration | Kubernetes (GKE) |
| CI/CD | Google Cloud Build |
| Image Registry | Google Artifact Registry |
| Storage | GCE Persistent Disk (PV/PVC) |

---

## Uygulama Mimarisi

```
┌─────────────────────────────────────────────────────┐
│                    Kullanıcı                        │
│                  (Browser/HTTP)                     │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP :80
                      ▼
┌─────────────────────────────────────────────────────┐
│           Kubernetes Service (LoadBalancer)         │
│              External IP → Port 80                  │
└─────────────────────┬───────────────────────────────┘
                      │ Port 3000
                      ▼
┌─────────────────────────────────────────────────────┐
│              Deployment (3 replika)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Pod 1   │  │  Pod 2   │  │  Pod 3   │          │
│  │ Node.js  │  │ Node.js  │  │ Node.js  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       └─────────────┼─────────────┘                │
│                     │ /data                         │
│              ┌──────▼──────┐                        │
│              │     PVC     │                        │
│              │  (1Gi disk) │                        │
│              └─────────────┘                        │
└─────────────────────────────────────────────────────┘
```

### Uygulama Özellikleri

- **Not ekleme/silme:** REST API üzerinden JSON veri yönetimi
- **Kalıcı depolama:** Notlar `/data/notes.json` dosyasında saklanır (PVC)
- **Health endpoint:** `/health` — Kubernetes probe'ları için
- **Pod bilgisi:** Her response hangi pod'dan geldiğini gösterir (load balancing testi için)

---

## Kubernetes Mimarisi

```
GKE Cluster
├── Namespace: default
│   ├── Deployment: notes-app (replicas: 3)
│   │   └── Pod template:
│   │       ├── Container: notes-app (Node.js)
│   │       ├── volumeMount: /data → notes-pvc
│   │       ├── livenessProbe: GET /health
│   │       └── readinessProbe: GET /health
│   │
│   ├── Service: notes-app-service (LoadBalancer)
│   │   └── port 80 → targetPort 3000
│   │
│   ├── HorizontalPodAutoscaler: notes-app-hpa
│   │   ├── minReplicas: 2
│   │   ├── maxReplicas: 10
│   │   └── CPU threshold: %70
│   │
│   ├── PersistentVolume: notes-pv (1Gi)
│   ├── PersistentVolumeClaim: notes-pvc (1Gi)
│   └── NetworkPolicy: notes-app-netpol
│       ├── Ingress: port 3000 izin
│       └── Egress: DNS + internet
```

---

## CI/CD Pipeline

```
Developer
   │
   │  git push origin main
   ▼
GitHub Repository
   │
   │  Webhook tetiklenur
   ▼
Cloud Build Pipeline
   │
   ├─► Adım 1: Docker build  (imaj oluşturulur)
   ├─► Adım 2: Test           (container ayağa kaldırılır, /health test edilir)
   ├─► Adım 3: Docker push    (Artifact Registry'ye gönderilir)
   ├─► Adım 4: GKE credentials (cluster'a bağlanılır)
   ├─► Adım 5: PV/PVC apply   (storage kaynakları güncellenir)
   ├─► Adım 6: NetworkPolicy  (network kuralları uygulanır)
   ├─► Adım 7: Deployment     (rolling update başlar)
   └─► Adım 8: Verify         (pod/service durumu kontrol edilir)
```

### Cloud Build Tetikleyici Kurulumu

```bash
# Tetikleyici oluştur (GitHub push → otomatik build)
gcloud builds triggers create github \
  --repo-name=final-project \
  --repo-owner=kubrakaraa\
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

---

## Kurulum ve Çalıştırma

### Ön Gereksinimler

```bash
# Google Cloud SDK kurulu ve giriş yapılmış olmalı
gcloud auth login
gcloud config set project kubra-final-project

# kubectl kurulu olmalı
gcloud components install kubectl
```

### 1. GKE Cluster Oluştur

```bash
gcloud container clusters create notes-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type e2-medium \
  --enable-autoscaling \
  --min-nodes 2 \
  --max-nodes 6
```

### 2. Docker İmajını Build Et ve Push Et

```bash
# Artifact Registry'de repo oluştur
gcloud artifacts repositories create notes-repo \
  --repository-format=docker \
  --location=us-central1

# İmajı build et
docker build -t gcr.io/kubra-final-project/notes-app:v1 .

# Push et
docker push gcr.io/kubra-final-project/notes-app:v1
```

### 3. Kubernetes Manifest'lerini Uygula

```bash
# Credentials al
gcloud container clusters get-credentials notes-cluster --zone us-central1-a

# deployment.yaml içindeki IMAGE'ı güncelle:
# gcr.io/kubra-final-project/notes-app:v1

# Sırayla uygula
kubectl apply -f k8s/pv.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/networkpolicy.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 4. Uygulamayı Test Et

```bash
# External IP'yi öğren
kubectl get service notes-app-service

# Tarayıcıda aç
# http://136.116.93.214
```

---

## Kubernetes Komutları

```bash
# Pod durumunu gör
kubectl get pods -l app=notes-app

# Deployment durumu
kubectl get deployment notes-app

# Service ve IP
kubectl get service notes-app-service

# Pod logları
kubectl logs -l app=notes-app --tail=50

# Pod içine gir
kubectl exec -it notes-app-6dfdc4c565-dqx79 -- sh

# PVC durumu
kubectl get pvc notes-pvc
kubectl get pv notes-pv

# NetworkPolicy
kubectl describe networkpolicy notes-app-netpol

# HPA durumu
kubectl get hpa notes-app-hpa
```

---

## Rolling Update ve Rollback

### Rolling Update (Sıfır Kesintili Güncelleme)

```bash
# Yeni imaj build et ve push et
docker build -t gcr.io/kubra-final-project/notes-app:v2 .
docker push gcr.io/kubra-final-project/notes-app:v2

# İmajı güncelle (rolling update otomatik başlar)
kubectl set image deployment/notes-app \
  notes-app=gcr.io/kubra-final-project/notes-app:v2

# Güncelleme sürecini izle
kubectl rollout status deployment/notes-app

# Pod'ları izle (eskiler kapanırken yenileri ayağa kalkar)
kubectl get pods -w
```

**Nasıl çalışır:**
- `maxSurge: 1` → önce 1 yeni pod açılır (toplam 4 pod)
- `maxUnavailable: 0` → eski pod'lar birer birer kapatılır
- Kullanıcı hiç kesinti yaşamaz

### Rollback

```bash
# Rollout geçmişini gör
kubectl rollout history deployment/notes-app

# Bir önceki versiyona dön
kubectl rollout undo deployment/notes-app

# Belirli bir versiyona dön
kubectl rollout undo deployment/notes-app --to-revision=1

# Doğrula
kubectl rollout status deployment/notes-app
```

---

## Scaling

### Manuel Scaling

```bash
# 5 pod'a çıkar
kubectl scale deployment notes-app --replicas=5

# Durumu izle
kubectl get pods -l app=notes-app
```

### Otomatik Scaling (HPA)

```bash
# HPA durumu
kubectl get hpa notes-app-hpa

# Yük testi (birçok istekle CPU'yu yükselt)
kubectl run -i --tty load-generator \
  --rm \
  --image=busybox:1.28 \
  --restart=Never \
  -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://notes-app-service/health; done"

# Başka terminal'de HPA'yı izle
kubectl get hpa notes-app-hpa -w
```

---

## Bileşenler Açıklaması

### Deployment
Uygulamanın kaç pod ile çalışacağını, hangi imajı kullanacağını ve güncelleme stratejisini tanımlar. `RollingUpdate` sayesinde yeni sürüme geçiş sırasında kullanıcılar kesinti yaşamaz.

### Service (LoadBalancer)
Pod'ların önünde durur ve gelen trafiği sağlıklı pod'lara dağıtır. GKE'de `LoadBalancer` tipi seçildiğinde otomatik olarak external IP atanır.

### PersistentVolume (PV) & PersistentVolumeClaim (PVC)
Pod'lar silinse bile verilerin kaybolmamasını sağlar. PV fiziksel diski temsil eder; PVC ise pod'un bu diskten talep ettiği alanı tanımlar.

### NetworkPolicy
Pod'lar arasındaki ve pod'lardan dışarıya olan ağ trafiğini kısıtlar. Sadece gerekli portlar ve kaynaklar açık tutularak güvenlik artırılır.

### HorizontalPodAutoscaler (HPA)
CPU kullanımı eşiği aşıldığında otomatik olarak yeni pod'lar başlatır. Yük azaldığında fazla pod'ları kapatır.

### Cloud Build (CI/CD)
Kodun GitHub'a push edilmesiyle tetiklenir; imaj build, test, push ve Kubernetes deploy adımlarını otomatik gerçekleştirir.

---




