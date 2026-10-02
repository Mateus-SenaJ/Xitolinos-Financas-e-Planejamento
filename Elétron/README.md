# Aplicativo desktop local

Esta pasta contém o shell Electron do Xitolinos. Em desenvolvimento ele inicia o ambiente local; no instalador ele inicia o backend Strapi, o preview React e o MySQL sob `127.0.0.1`, sem abrir acesso à rede.

O instalador é gerado por `npm run desktop:package` na raiz. Ele inclui a interface compilada, backend, runtime Node da máquina de build e arquivo de migração antiga. O MySQL Community Server 8.4 permanece como pré-requisito do computador de destino. Banco e `.env` do instalador ficam em `%LOCALAPPDATA%\Xitolinos Planejamento`, fora da pasta do programa.
