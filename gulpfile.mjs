import gulp from "gulp";
import concat from "gulp-concat";
import dartSass from 'sass';
import gulpSass from "gulp-sass";
import autoprefixer from "gulp-autoprefixer";
import hash from "gulp-hash";
import { deleteAsync } from "del";
import svgmin from "gulp-svgmin";
import imagemin from "gulp-imagemin";
import imageResize from "gulp-image-resize";
import uglify from "gulp-uglify";
import cssmin from "gulp-cssmin";
import changed from "gulp-changed";
// import gzip from "gulp-gzip";

const sass = gulpSass(dartSass);

// Compile SCSS files to CSS
async function scss() {

  //Delete our old css files
  deleteAsync(["static/css/**/*"])

  //compile hashed css files
  gulp.src(["static/vendor/css/**/*", "static/src/scss/main.scss"])
    .pipe(sass({
      outputStyle: "compressed"
    }))
    .pipe(autoprefixer())
    .pipe(concat('main.css'))
    .pipe(cssmin())
    // .pipe(gzip())
    .pipe(hash())
    .pipe(gulp.dest("static/css"))
    //Create a hash map
    .pipe(hash.manifest("hash.json"))
    //Put the map in the data directory
    .pipe(gulp.dest("data/css"))

  //Delete our old css files
  deleteAsync(["static/demo/css/*"])

  //compile hashed css files
  gulp.src(["static/demo/src/css/*"])
    .pipe(sass({
      outputStyle: "compressed"
    }))
    .pipe(autoprefixer())
    .pipe(cssmin())
    // .pipe(gzip())
    .pipe(hash())
    .pipe(gulp.dest("static/demo/css"))
    //Create a hash map
    .pipe(hash.manifest("hash.json"))
    //Put the map in the data directory
    .pipe(gulp.dest("data/demo/css"))
}

async function img() {
  gulp.src("static/src/img/previews/**/*")
    .pipe(imageResize({
      width: 128,
      height: 128,
      cover: true,
      crop: true
    }))
    .pipe(gulp.dest("static/img/previews"))

  gulp.src("static/src/img/**/*")
    .pipe(changed("static/img"))
    .pipe(imagemin())
    // .pipe(gzip())
    .pipe(gulp.dest("static/img"))

  gulp.src("static/demo/src/img/**/*")
    .pipe(imagemin())
    // .pipe(gzip())
    .pipe(gulp.dest("static/demo/img"))
}

// Hash SVG
async function svg() {
  deleteAsync(["static/svg/**/*"])
  gulp.src("static/src/svg/**/*")
    .pipe(svgmin())
    // .pipe(hash())
    .pipe(gulp.dest("layouts/partials/svg"))
  // .pipe(hash.manifest("hash.json"))
  //.pipe(gulp.dest("data/img"))
}

// Hash javascript
async function js() {
  deleteAsync(["static/js/**/*"])
  gulp.src(["static/vendor/js/**/*", "static/src/js/**/*"])
    .pipe(concat('main.js'))
    .pipe(uglify())
    // .pipe(gzip())
    .pipe(hash())
    .pipe(gulp.dest("static/js"))
    .pipe(hash.manifest("hash.json"))
    .pipe(gulp.dest("data/js"))

  deleteAsync(["static/demo/js/**/*"])
  gulp.src(["static/demo/src/js/**/*"])
    .pipe(concat('main.js'))
    .pipe(uglify())
    // .pipe(gzip())
    .pipe(hash())
    .pipe(gulp.dest("static/demo/js"))
    .pipe(hash.manifest("hash.json"))
    .pipe(gulp.dest("data/demo/js"))
}

const rebuildFiles = gulp.series(scss, img, svg, js);

// Set watch as default task
const watchFiles = async function () {
  gulp.watch(["static/vendor/css/**/*", "static/src/scss/**/*", "static/demo/src/css/*"], scss);
  gulp.watch("static/src/img/**/*", img);
  gulp.watch("static/src/svg/**/*", svg);
  gulp.watch(["static/vendor/js/**/*", "static/src/js/**/*"], js);
}

export { rebuildFiles as rebuild };
export { watchFiles as default };