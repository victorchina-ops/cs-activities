using System;

class Program
{
    static void Main()
    {
        int n = int.Parse(Console.ReadLine());
        if (n % 2 == 0) Console.WriteLine("זוגי"); else Console.WriteLine("אי-זוגי");
        if (n % 2 == 1) Console.WriteLine("n%2==1 true"); else Console.WriteLine("n%2==1 false");
        Console.WriteLine(n % 2);
        if (n > 0) Console.WriteLine("חיובי"); else if (n < 0) Console.WriteLine("שלילי"); else Console.WriteLine("אפס");
    }
}
