using System;

class Program
{
    static void Main()
    {
        int sec = int.Parse(Console.ReadLine());
        int h = sec / 3600;
        int mi = sec % 3600 / 60;
        int s = sec % 60;
        Console.WriteLine(h + ":" + mi + ":" + s);
        Console.WriteLine("{0:D2}:{1:D2}:{2:D2}", h, mi, s);
    }
}
