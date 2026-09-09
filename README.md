# Mapa de Referências — archviz_toons

Ferramenta web para organizar, por projeto, a cor de referência e as imagens de cada material usado nos toons (Piso, Parede, Vidro, Água, etc.). Substitui o quadro que era feito no Miro.

- **Site**: https://controlenovo.com (publicado via GitHub Pages a partir deste repositório)
- **Banco de dados / armazenamento de imagens**: [Supabase](https://supabase.com) (projeto `archviz_toons`, ref `gxgsuvsckoeyeeygyhck`)

## Como funciona

O site é só HTML + CSS + JavaScript puro — sem servidor próprio. Toda a persistência (projetos, cores, imagens) fica no Supabase:

- `index.html` — estrutura da página e os templates de categoria/variação.
- `style.css` — aparência (tema escuro, tipografia).
- `app.js` — toda a lógica: conecta no Supabase, cria/abre projetos, salva cor e label de cada variação, faz upload de imagens pro bucket privado.

Cada projeto tem um link próprio (`controlenovo.com/?p=<id-do-projeto>`), que pode ser compartilhado. As imagens ficam num bucket **privado** — a página busca uma URL assinada e temporária pra exibir cada uma, então ninguém acessa os arquivos sem passar pela aplicação.

## Categorias e "pass"

A lista de categorias (em `app.js`, constante `CATEGORIES`) segue a mesma taxonomia usada no override de Material ID no 3ds Max. A maioria usa o Material ID padrão; **Vidro** e **Água** usam um pass separado (`refractionID`), por serem superfícies transparentes — por isso aparecem com uma etiqueta diferente na interface.

## Testar localmente

Como é só HTML/CSS/JS estático, basta abrir uma "live server" na pasta — por exemplo, com a extensão **Live Server** do VS Code, ou rodando no terminal (dentro da pasta do projeto):

```bash
npx serve .
```

Depois abra o endereço que aparecer no navegador. Como o app fala direto com o Supabase pela internet, os dados salvos localmente já são os mesmos dados reais do banco (não tem "modo teste" separado) — então cuidado ao mexer em projetos existentes.

## Publicar uma alteração

1. As mudanças em `index.html`, `style.css` ou `app.js` já ficam prontas neste repositório clonado localmente.
2. Revise o que mudou (`git status` / `git diff`) e confirme que faz sentido.
3. Dê `git push` pra subir pro GitHub — o GitHub Pages publica automaticamente em alguns minutos.

## Segurança

- A chave usada em `app.js` (`SUPABASE_ANON_KEY`) é a chave **publicável**, feita para ficar exposta no navegador — ela não dá acesso de administrador. A segurança real está nas regras (RLS) do banco e no bucket privado do Supabase.
- O acesso a um projeto depende de conhecer o link/id dele (como um link de convidado do Miro/Figma) — não é um sistema de login com senha. Suficiente para uso com poucos clientes por vez, mas não deve ser tratado como acesso restrito de verdade.
