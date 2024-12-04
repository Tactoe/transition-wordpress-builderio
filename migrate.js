const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const { decode } = require('html-entities');
const { WPThematics, WPFormats, WPMedias } = require('./WPlists');
const { builderSizes } = require('./builderPresets');
// const { post } = require('request');
const config = require('../../config');
// const error = require('../../components/errors');
var firstHeaderProcessed = false;
var ownerID = "";
var apiKey = "";

// async function uploadUser (body) {
//   const res = await axios({
//     method: 'post',
//     url: `https://builder.io/api/v1/write/user`,
//     headers: {
//       'Authorization': `Bearer ${config.builder.writeApiKey}`,
//       'Content-Type': 'application/json'
//     },
//     data: { name: body.name, data: body }
//   });

//   return res;
// }

// ******* Content migration to Builder functions *******

async function migrateImageToBuilder (WPImageUrl, imageName) {
  var splitUrl = WPImageUrl.split('.');
  var extension = splitUrl[splitUrl.length - 1];

  const WPImageRes = await fetch(WPImageUrl, {
    method: 'GET'
  });
  var imageData = await WPImageRes.buffer();

  const res = await fetch('https://builder.io/api/v1/upload?name=' + imageName, {
    method: 'POST',
    body: imageData,
    headers: {
      'Authorization': `Bearer ${config.builder.writeApiKey}`,
      'Content-Type': 'image/' + extension
    }
  });
  const resJson = await res.json();
  return resJson.url;
}

async function migratePostToBuilder (body) {
  const res = await axios({
    method: 'post',
    url: `https://builder.io/api/v1/write/article`,
    headers: {
      'Authorization': `Bearer ${config.builder.writeApiKey}`,
      'Content-Type': 'application/json'
    },
    data: body
  });

  return res;
}

// ******* API Calls Builder functions *******

async function getBuilderImageUrl (imageName) {
  var url = 'https://cdn.builder.io/api/v1/data?limit=100&collection=assets&query.ownerId=' + ownerID+ '&query.metadata.from.$ne=aiGenerate&query.name.$regex=.*' + imageName + '.*&query.name.$options=i&cachebust=true&offset=0&noTraverse=true&sort.createdDate=-1&cachebuster=1694762710787&apiKey=' + apiKey;
  const res = await axios({
    method: 'get',
    url: url
  });

  if (res.data.results.length === 0) return '';
  else return res.data.results[0].url;
}


async function getInfoBuilder (infoType) {
  const postUrl = `https://cdn.builder.io/api/v3/content/` + infoType + `?apiKey=` + apiKey;
  const res = await axios({
    method: 'get',
    url: postUrl
  });
  return res;
}

function getBuilderModelSlug (WPModel, WPtoBuilderList, builderModelList) {
  // get the matching builder model name of the old WP model, then use it to get the builder model id
  var remappedName = WPtoBuilderList[WPModel].new;
  for (const builderModel of builderModelList) {
    if (builderModel.name.toLowerCase() === remappedName.toLowerCase()) {
      return builderModel.data.slug;
    }
  };
}

function getBuilderModelId (WPModel, WPtoBuilderList, builderModelList) {
  // get the matching builder model name of the old WP model, then use it to get the builder model id
  if (!WPtoBuilderList[WPModel]) {
    console.log('Model not found: ', WPModel);
    return;
    // throw error.generateError({
    //   code: 404,
    //   message: 'ERROR_MODEL_NOT_FOUND'
    // });
  }
  var remappedName = WPtoBuilderList[WPModel].new;
  for (const builderModel of builderModelList) {
    if (builderModel.name.toLowerCase() === remappedName.toLowerCase()) {
      return builderModel.id;
    }
  };
}

function getBuilderUserId (WPUser, WPtoBuilderList, builderUserList) {
  // get the matching builder model name of the old WP model, then use it to get the builder model id
  if (!WPtoBuilderList[WPUser]) {
    console.log('Model not found: ', WPUser);
    return;
    // throw error.generateError({
    //   code: 404,
    //   message: 'ERROR_MODEL_NOT_FOUND'
    // });
  }
  var remappedName = WPtoBuilderList[WPUser].new;
  for (const builderModel of builderUserList) {
    if (builderModel.name.toLowerCase() === remappedName.toLowerCase()) {
      return builderModel.id;
    }
  };
}


// ******* API Calls Wordpress functions *******

async function getInfoWP (infoType) {
  const postUrl = `https://france.makesense.org/wp-json/wp/v2/` + infoType + `?per_page=100`;
  const res = await axios({
    method: 'get',
    url: postUrl
  });
  return res.data;
}

async function getPostsWP (page, postAmount) {
  // IMPORTANT : URL may not work above a certain number (10 or 30) if you are not logged into makesense.org's wordpress admin
  const postUrl = `https://france.makesense.org/wp-json/wp/v2/posts?per_page=` + postAmount + `&page=` + page;
  const res = await axios({
    method: 'get',
    url: postUrl
  });
  return res;
}

// ******* Builder block creation functions *******

async function createImageBlock (block) {
  var splitUrl = block.attrs.url.split('/');
  var imageName = splitUrl[splitUrl.length - 1];

  // see if the image has already been uploaded to builder
  var builderImageUrl = await getBuilderImageUrl(imageName);
  var imageUrl = builderImageUrl !== '' ? builderImageUrl : await migrateImageToBuilder(block.attrs.url, imageName);
  var imageBlock = {
    '@type': '@builder.io/sdk:Element',
    '@version': 2
  };
  imageBlock['component'] = {
    'name': 'Image',
    // pas sur de comment c'est defini
    'options': {
      // "image": "https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=719",
      'image': imageUrl,
      'backgroundSize': 'cover',
      'backgroundPosition': 'center',
      'lazy': false,
      'fitContent': true,
      // "aspectRatio": 0.61,
      'lockAspectRatio': false,
      // "height": 837,
      // "width": 1116,
      // "altText": "Tiny house avec un proche et des chaises longues",
      'altText': block.attrs.alt
      // "srcset": "https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=100 100w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=200 200w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=400 400w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=800 800w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=1200 1200w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=1600 1600w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=2000 2000w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=719 719w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=618 618w, https://cdn.builder.io/api/v1/image/assets%2F6699e11b753c40d5a84d90175d459363%2F4638dd3a81a641ccadab0933cf36da74?width=543 543w",
      // "sizes": "(max-width: 638px) 97vw, (max-width: 998px) 55vw, 52vw"
    }
  };
  imageBlock['responsiveStyles'] = { large: builderSizes['image'] };
  return imageBlock;
}

function createQuoteBlock (text, author = '') {
  var returnBlock = {
    '@type': '@builder.io/sdk:Element',
    '@version': 2
    // "tagName": "div",
  };
  returnBlock['component'] = {
    'name': 'Quote',
    'options': {
      'text': decode(text)
    }
  };
  if (author !== '') {
    // extract the author from the html tags
    var authorString = author.match(/>([^>]+?)<\//)[1];
    returnBlock['component']['options']['author'] = '- ' + decode(authorString);
  }
  // copying the builderSize to avoid any global override
  returnBlock['responsiveStyles'] = { large: JSON.parse(JSON.stringify(builderSizes['text'])) };
  return returnBlock;
}

function createSectionBlock (children) {
  var returnBlock = {
    '@type': '@builder.io/sdk:Element',
    '@version': 2,
    // "tagName": "div",
    'component': {
      'name': 'Section'
    },
    'children': children
  };
  // copying the builderSize to avoid any global override
  returnBlock['responsiveStyles'] = { large: JSON.parse(JSON.stringify(builderSizes['section'])) };
  return returnBlock;
}

function createTextBlock (text, blockType, overrideStyle = '') {
  var returnBlock = {
    '@type': '@builder.io/sdk:Element',
    '@version': 2
    // "tagName": "div",
  };
  returnBlock['component'] = {
    'name': 'Text',
    'options': {
      'text': decode(text)
    }
  };
  // copying the builderSize to avoid any global override
  returnBlock['responsiveStyles'] = { large: JSON.parse(JSON.stringify(builderSizes[blockType])) };
  if (overrideStyle !== '') {
    for (const property in overrideStyle) {
      returnBlock['responsiveStyles']['large'][property] = overrideStyle[property];
    }
  }
  return returnBlock;
}

async function processBlock (block, blockList) {
  if (block.blockName === 'core/freeform') {
    const blockContent = block.rendered.split('\n');
    var i = 0;
    while (i < blockContent.length) {
      // 1. check if the content is empty (regex checks for cases like '<p> </p>')
      // eslint-disable-next-line no-useless-escape, no-irregular-whitespace
      if (blockContent[i] === '' || blockContent[i].match(/^<[^>\/]+?>[\s ]*<\//) !== null) {
        i++;
        continue;
      }

      // 2.  if we find a special block (quote, ul), extract it
      if (blockContent[i].match('<blockquote')) {
        // we reached the blockquote. If length is 2, there is no author. If length is 3 there is an author
        if (blockContent[i + 2].match('</blockquote')) {
          blockList.push(createQuoteBlock(blockContent[i + 1].replace(/ +style=".+?"/g, '')));
          i += 2;
        }
        else if (blockContent[i + 3].match('</blockquote')) {
          blockList.push(createQuoteBlock(blockContent[i + 1].replace(/ +style=".+?"/g, ''), blockContent[i + 2].replace(/ +style=".+?"/g, '')));
          i += 3;
        }
        else {
          console.log('something is weird with the quote');
        }
      }
      else if (blockContent[i].match('<h1') || blockContent[i].match('<h2') || blockContent[i].match('<h3') || blockContent[i].match('<h4')) {
        var content = blockContent[i].replace('<h1', '<h2');
        content = content.replace('</h1', '</h2');
        // turning the first header into a p styled like a h2
        if (!firstHeaderProcessed && content.match('<h2') !== null) {
          content = content.replace('<h2', `<p style="box-sizing: border-box;border: 0;font: inherit;margin: 0;padding: 0;vertical-align: baseline;font-family: var(--font-heading);font-weight: 800;line-height: var(--line-height-xs);font-size: var(--font-size-xxxxl);"`);
          content = content.replace('</h2', '</p');
          firstHeaderProcessed = true;
          blockList.push(createTextBlock(content, 'header'));
        }
        else {
          blockList.push(createTextBlock(content.replace(/ +style=".+?"/g, ''), 'header'));
        }
      }
      else if (blockContent[i].match('<p')) {
        var text = '';
        while (blockContent[i].match('<p')) {
          // eslint-disable-next-line no-useless-escape
          if (blockContent[i] === '' || blockContent[i].match(/$<[^>\/]+?> *<\//) !== null) {
          }
          else {
            text += blockContent[i].replace(/ +style=".+?"/g, '');
          }
          i++;
        }
        blockList.push(createTextBlock(text, 'text'));
        // skip the i++ at the bottom since we want to process the block we're currently on
        continue;
      }
      else if (blockContent[i].match('<ol')) {
        var listContent = '';
        while (blockContent[i].match('</ol') === null) {
          // eslint-disable-next-line no-useless-escape
          if (blockContent[i] === '' || blockContent[i].match(/$<[^>\/]+?> *<\//) !== null) {

          }
          else {
            listContent += blockContent[i].replace(/ +style=".+?"/g, '');
          }
          i++;
        }
        // add the tag closing the list
        listContent += blockContent[i].replace(/ +style=".+?"/g, '');
        blockList.push(createTextBlock(listContent, 'text'));
      }
      else if (blockContent[i].match('<ul')) {
        listContent = '';
        while (blockContent[i].match('</ul') === null) {
          // eslint-disable-next-line no-useless-escape
          if (blockContent[i] === '' || blockContent[i].match(/$<[^>\/]+?> *<\//) !== null) {

          }
          else {
            listContent += blockContent[i].replace(/ +style=".+?"/g, '');
          }
          i++;
        }
        // add the tag closing the list
        listContent += blockContent[i].replace(/ +style=".+?"/g, '');
        blockList.push(createTextBlock(listContent, 'text'));
      }
      // 3. default content processing
      else {
        blockList.push(createTextBlock(blockContent[i], 'other'));
      }
      i++;
    }
  }
  // if it's an acf group with no header just make a single block out of the content
  else if (block.blockName === 'acf/group') {
    var childrenList = [];
    for (const innerBlock of block.innerBlocks) {
      await processBlock(innerBlock, childrenList);
    }
    blockList.push(createSectionBlock(childrenList));
  }
  else if (block.blockName === 'core/image' && block.attrs.url !== '') {
    var imageBlock = await createImageBlock(block);
    blockList.push(imageBlock);
    // get the image caption if there's one and create a block right below
    if (block.rendered.match('<figcaption>') !== null) {
      var captionText = block.rendered.match(/<figcaption>(.+?)<\/figcaption>/)[1];
      var italics = block.rendered.match('<em>') !== null ? 'font-style: italic;' : '';
      captionText = captionText.replace('<em>', '');
      captionText = captionText.replace('</em>', '');

      var imageCaption = '<p style="' + italics + 'line-height: 1.6;color: #7a7a7a;font-size: var(--font-size-s);text-align: center;box-sizing: border-box;">' + captionText + '</p>';
      blockList.push(createTextBlock(imageCaption, 'text', { 'marginTop': '12px' }));
    }
  }
}

var uploadedSlugList = '';
async function migrate () {
  try {
    fs.readFile(path.resolve(__dirname, './uploadedSlugs.log'), 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        return;
      }
      uploadedSlugList = data.split('\n');
    });
  }
  catch (err) {
    // Here you get the error when the file was not found,
    // but you also get any other error
    console.error(err);
    return;
  }

  // getting the WP user dynamically since the names are the same on both sides
  var unformattedWPUserList = await getInfoWP('users');
  var WPUserList = {};
  unformattedWPUserList.forEach(elem => {
    WPUserList[elem.id] = { new: elem.name };
  });
  var builderUserList = await getInfoBuilder('user');
  builderUserList = builderUserList.data.results;

  // thematics and pillars have to be converted from WP name to Builder name so the list was handmade
  var WPThematicList = WPThematics;
  var builderThematicList = await getInfoBuilder('topic');
  builderThematicList = builderThematicList.data.results;
  var WPPillarList = WPFormats;
  var builderPillarList = await getInfoBuilder('pilier');
  builderPillarList = builderPillarList.data.results;

  var tagList = await getInfoWP('tags');

  // get all WP posts
  // postToGet can go up to 100 but the request to the web API can malfunction. 10 or 30 is recommended (see comment in getPostsWP())
  var postsToGet = 10;
  // first request to know how many pages we need to get
  var totalPosts = await getPostsWP(1, postsToGet);
  totalPosts = totalPosts.headers['x-wp-total'];
  var postCollection = [];
  var postCollected = 0;
  var page = 1;
  // Collect the posts
  // Use this to limit the amount of post added to the upload list. By default will gather all 450 + posts
  // while (postCollected < 150) {
  while (postCollected < totalPosts) {
    var { data: posts } = await getPostsWP(page, postsToGet);
    page++;
    postCollection = postCollection.concat(posts);
    postCollected += postsToGet;
  }

  // var postProcessed = 0;
  // process the posts
  for (const post of postCollection) {
    console.log('processing ' + post.slug);
    // check if post is already in builder
    if (uploadedSlugList.includes(post.slug) || post.slug !== 'et-si') {
      console.log('skipping ' + post.slug);
      continue;
    }

    var tags = [];
    if (post.tags) {
      post.tags.forEach(postTag => {
        tagList.forEach(tagWP => {
          if (tagWP.id === postTag.id) {
            tags.push(postTag.name);
          }
        });
      });
    }
    firstHeaderProcessed = false;
    var blocks = post.block_data;
    var blockList = [];
    // go through the blocks and migrate them
    for (const block of blocks[0].innerBlocks) {
      await processBlock(block, blockList);
    }

    var isDraft = false;
    if (post.thematic.length === 0 || post['mks-format'].length === 0) {
      isDraft = true;
    }
    var builderUserId = getBuilderUserId(post.author, WPUserList, builderUserList);
    var postDate = new Date(post.date);

    var convertedPost = {
      'name': decode(post.title.rendered),
      'createdDate': postDate.getTime(),
      'firstPublished': postDate.getTime(),
      'published': isDraft ? 'draft' : 'published',
      'data': {
        'slug': post.slug,
        'status': isDraft ? 'Brouillon' : 'Publié',
        'title': decode(post.title.rendered),
        'blocks': blockList,
        'image': post.yoast_head_json.og_image[0].url,
        'media': WPMedias[post.post_media[0]] ? WPMedias[post.post_media[0]].new : undefined,
        'descriptionCourte': decode(post.yoast_head_json.description),
        'tags': tags,
        'auteurice': {
          '@type': '@builder.io/core:Reference',
          'id': builderUserId,
          'model': 'user'
        },
        'metaTitle': decode(post.yoast_head_json.og_title),
        'metaDescription': decode(post.yoast_head_json.og_description)
      }
    };
    if (post.thematic.length !== 0) {
      var builderThematicId = getBuilderModelId(post.thematic[0], WPThematicList, builderThematicList);
      var builderThematicSlug = getBuilderModelSlug(post.thematic[0], WPThematicList, builderThematicList);
      convertedPost['data']['thematique'] = {
        '@type': '@builder.io/core:Reference',
        'id': builderThematicId,
        'model': 'topic'
      };
      convertedPost['query'] = [
        {
          'property': 'urlPath',
          'operator': 'is',
          'value': '/media/' + builderThematicSlug + '/' + post.slug
        }
      ];
    }
    if (post['mks-format'].length !== 0) {
      var builderPillarId = getBuilderModelId(post['mks-format'][0], WPPillarList, builderPillarList);
      convertedPost['data']['pilier'] = {
        '@type': '@builder.io/core:Reference',
        'id': builderPillarId,
        'model': 'pilier'
      };
    }
    console.log(JSON.stringify(convertedPost.data.blocks, null, 4));
    migratePostToBuilder(convertedPost);

    fs.appendFile(path.resolve(__dirname, './uploadedSlugs.log'), post.slug + '\n', err => {
      if (err) {
        console.error(err);
      }
    });
    // Use this to limit the number of posts uploaded at once
    // if (postProcessed === 9)
    //   break;
    // else postProcessed++;
  }
}
migrate();