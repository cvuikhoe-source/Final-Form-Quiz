import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('exam_questions').select('lesson_id');
  if (error) {
    console.error('Error:', error);
    return;
  }
  const counts = {};
  data.forEach((r) => {
    counts[r.lesson_id] = (counts[r.lesson_id] || 0) + 1;
  });
  console.log('Exam questions by lesson_id:', counts);
}

check();

