```mermaid
graph TB
    subgraph "Kubernetes Cluster (kafka-monitoring namespace)"
        subgraph "Kafka Core Infrastructure"
            ZK[Zookeeper StatefulSet<br/>zookeeper-0<br/>Port: 2181]
            
            subgraph "Kafka Broker (kafka-0)"
                KAFKA[Kafka StatefulSet<br/>Confluent CP 7.5.0]
                
                subgraph "Exposed Ports"
                    P1[9092: Broker Protocol<br/>PLAINTEXT]
                    P2[9999: JMX RMI<br/>Remote Monitoring]
                    P3[9404: Prometheus<br/>JMX Exporter]
                end
                
                JMXAGENT[JMX Prometheus<br/>Java Agent<br/>v0.19.0]
            end
            
            KAFKA -.->|coordination| ZK
            JMXAGENT -->|expose| P3
            KAFKA -->|metrics| P2
        end
        
        subgraph "Monitoring Infrastructure"
            subgraph "NR Infrastructure DaemonSet"
                NRINFRA[newrelic-infrastructure<br/>Pod per Node]
                
                subgraph "Integrated Components"
                    NRIK1[nri-kafka #1<br/>Broker/Topic Metrics<br/>30s interval]
                    NRIK2[nri-kafka #2<br/>Consumer Lag Only<br/>15s interval]
                    NRIFLEX[nri-flex<br/>Prometheus Scraper<br/>30s interval]
                end
            end
            
            subgraph "Standalone OHI Deployment"
                OHIDEPLOY[kafka-sharegroup-ohi<br/>Deployment]
                OHIAGENT[NR Infrastructure<br/>Agent]
                OHISCRIPT[Python OHI Script<br/>sharegroup-ohi.py]
            end
        end
        
        subgraph "Data Generation & Testing"
            subgraph "Comprehensive Simulator"
                SIM[kafka-comprehensive-simulator<br/>Deployment]
                SIMORCHESTRATOR[orchestrator.sh]
                SIMCOMPONENTS[topic-manager.sh<br/>producer-patterns.sh<br/>consumer-patterns.sh<br/>metrics-generator.py<br/>sharegroup-simulator.py]
            end
            
            SGC[share-group-consumer<br/>Deployment<br/>(Kafka 4.0 EA)]
            
            WLGEN[workload-generator<br/>Job]
            
            TROUBLE[troubleshooting-pod<br/>Pod]
        end
        
        subgraph "Configuration Layer"
            subgraph "Core Config"
                CM1[kafka-env-config<br/>Environment Variables]
                S1[kafka-env-secret<br/>NR License Key]
                CM2[newrelic-config<br/>nri-kafka settings]
            end
            
            subgraph "Monitoring Config"
                CM3[newrelic-flex-config<br/>Prometheus scraping]
                CM4[custom-ohi-scripts<br/>OHI Python code]
                CM5[custom-ohi-definition<br/>OHI integration def]
                CM6[kafka-jmx-exporter-config<br/>JMX→Prometheus rules]
            end
            
            subgraph "Test Config"
                CM7[kafka-comprehensive-simulator<br/>Simulator scripts]
                CM8[share-group-test-script<br/>Consumer test code]
                CM9[workload-generator<br/>Load test scripts]
            end
        end
        
        subgraph "Services"
            KAFKASVC[kafka Service<br/>Headless]
            ZKSVC[zookeeper Service]
        end
    end
    
    subgraph "New Relic One Platform"
        subgraph "Event Types Generated"
            subgraph "Traditional Kafka Events"
                KBS[KafkaBrokerSample<br/>Broker metrics]
                KTS[KafkaTopicSample<br/>Topic statistics]
                KCS[KafkaConsumerSample<br/>Consumer lag]
                KOS[KafkaOffsetSample<br/>Offset tracking]
                KPS[KafkaPartitionSample<br/>Partition details]
            end
            
            subgraph "Share Group Events"
                QS[QueueSample<br/>Share Group metrics]
                M[Metric Events<br/>Prometheus metrics]
            end
            
            subgraph "Infrastructure Events"
                SS[SystemSample<br/>Host metrics]
                IE[IntegrationError<br/>Error tracking]
            end
        end
        
        subgraph "Visualization Layer"
            DASH[Custom Dashboards<br/>6 pages]
            QSU[Queues & Streams UI<br/>Share Groups]
            INF[Infrastructure UI<br/>Traditional metrics]
            ALERTS[Alert Policies<br/>3 conditions]
        end
    end
    
    %% Monitoring Approach 1: Traditional Kafka (nri-kafka)
    ZK -->|Zookeeper<br/>Discovery| NRIK1
    P2 -->|JMX Connection<br/>Port 9999| NRIK1
    KAFKA -->|Bootstrap<br/>Port 9092| NRIK2
    
    %% Monitoring Approach 2: Prometheus Scraping (nri-flex)
    P3 -->|HTTP GET<br/>/metrics| NRIFLEX
    
    %% Monitoring Approach 3: Custom OHI
    P3 -->|HTTP GET<br/>/metrics| OHISCRIPT
    OHISCRIPT -->|Transform| OHIAGENT
    
    %% Data Generation Flow
    SIMORCHESTRATOR -->|orchestrate| SIMCOMPONENTS
    SIMCOMPONENTS -->|produce/consume| P1
    SGC -->|Share Group<br/>consume| P1
    WLGEN -->|generate load| P1
    
    %% Configuration Dependencies
    CM1 -.->|env vars| ALL[All Components]
    S1 -.->|license| NRINFRA
    S1 -.->|license| OHIAGENT
    CM2 -.->|config| NRIK1
    CM2 -.->|config| NRIK2
    CM3 -.->|config| NRIFLEX
    CM4 -.->|scripts| OHISCRIPT
    CM5 -.->|definition| OHIAGENT
    CM6 -.->|JMX rules| JMXAGENT
    CM7 -.->|scripts| SIMCOMPONENTS
    
    %% Metrics Flow to New Relic
    NRIK1 ==>|sends| KBS
    NRIK1 ==>|sends| KTS
    NRIK2 ==>|sends| KCS
    NRIK1 ==>|sends| KOS
    NRIK1 ==>|sends| KPS
    NRIFLEX ==>|sends| M
    OHIAGENT ==>|sends| QS
    NRINFRA ==>|sends| SS
    
    %% UI Relationships
    KBS --> INF
    KTS --> INF
    KCS --> INF
    QS --> QSU
    M --> DASH
    SS --> INF
    
    %% Alert Sources
    QS -.->|triggers| ALERTS
    KCS -.->|triggers| ALERTS
    
    %% Service Connections
    KAFKASVC -.->|headless| KAFKA
    ZKSVC -.->|cluster IP| ZK
    
    %% Styling
    classDef kafka fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    classDef monitoring fill:#f3e5f5,stroke:#4a148c,stroke-width:3px
    classDef data fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef config fill:#efebe9,stroke:#3e2723,stroke-width:1px
    classDef newrelic fill:#e8f5e9,stroke:#1b5e20,stroke-width:3px
    classDef service fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    
    class KAFKA,ZK,P1,P2,P3 kafka
    class NRINFRA,NRIK1,NRIK2,NRIFLEX,OHIDEPLOY monitoring
    class SIM,SGC,WLGEN,TROUBLE data
    class CM1,CM2,CM3,CM4,CM5,CM6,CM7,CM8,CM9,S1 config
    class KBS,KTS,KCS,QS,M,DASH,QSU,INF newrelic
    class KAFKASVC,ZKSVC service
```
